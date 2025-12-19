import React, { useState } from 'react';
import "../utils/ui.css";
export default function CompetitorLookup() {
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    const configuredBackend = import.meta.env.VITE_BACKEND_URL || '';
    const localBackend = 'http://localhost:8080';

    async function tryFetch(usernameToFetch) {
        const urlsToTry = [];
        // prefer local for development; then configured backend
        urlsToTry.push(localBackend);
        if (configuredBackend && configuredBackend !== localBackend) urlsToTry.push(configuredBackend);

        let lastErr = null;
        for (const base of urlsToTry) {
            const url = `${base.replace(/\/$/, '')}/api/x/fetch/${encodeURIComponent(usernameToFetch)}`;
            try {
                const resp = await fetch(url);
                const contentType = resp.headers.get('content-type') || '';

                if (!resp.ok) {
                    let body = '';
                    try {
                        body = contentType.includes('application/json') ? JSON.stringify(await resp.json()) : await resp.text();
                    } catch (e) {
                        body = `(failed to read body: ${e?.message || e})`;
                    }
                    throw new Error(`Request to ${url} failed: ${resp.status} ${resp.statusText} - ${body}`);
                }

                if (contentType.includes('application/json')) {
                    const data = await resp.json();
                    return { data, usedBackend: base };
                }

                const text = await resp.text();
                throw new Error(`Expected JSON from ${url} but received text/HTML: ${text.slice(0, 1000)}`);
            } catch (err) {
                lastErr = err;
                // continue to next backend
            }
        }

        throw lastErr;
    }

    const handleFetch = async () => {
        setError(null);
        setResult(null);
        if (!username.trim()) {
            setError('Please enter a username');
            return;
        }

        setLoading(true);
        try {
            const { data, usedBackend } = await tryFetch(username.trim());
            setResult({ ...data, _usedBackend: usedBackend });
        } catch (err) {
            setError(String(err?.message || err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Competitor Lookup</h2>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                    placeholder="Enter username (no @)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={{ padding: '8px 12px', flex: 1 }}
                />
                <button onClick={handleFetch} disabled={loading}>
                    {loading ? 'Loading...' : 'Fetch'}
                </button>
            </div>

            {error && (
                <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>
            )}

            {result && (
                <div style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 6 }}>
                    <strong>Username:</strong> {result.username}
                    <br />
                    <strong>User ID:</strong> {result.userId}
                    <br />
                    <strong>Backend:</strong> {result._usedBackend}
                    <br />
                    <strong>Posts:</strong>
                    <pre style={{ marginTop: 8 }}>{JSON.stringify(result.posts || [], null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
