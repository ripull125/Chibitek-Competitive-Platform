// client/src/pages/KeywordTracking.jsx
import "../utils/ui.css";

import React, { forwardRef, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

const KeywordTracking = forwardRef(function KeywordTracking(_, ref) {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(undefined);

  // Get current user on mount
  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) {
        if (mounted) setCurrentUserId(null);
        return;
      }
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setCurrentUserId(data?.user?.id ?? null);
      } catch {
        if (mounted) setCurrentUserId(null);
      }
    };
    loadUser();
    return () => { mounted = false; };
  }, []);

  const fetchKeywords = () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);

    const url = apiUrl(`/api/keywords?user_id=${encodeURIComponent(currentUserId)}`);
    console.log("[KeywordTracking] fetching:", url);

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        console.log("[KeywordTracking] response:", d);
        if (d.error) throw new Error(d.error);
        setKeywords(d.keywords || []);
        setMeta({ totalPosts: d.totalPosts, totalTopPosts: d.totalTopPosts, debug: d.debug });
      })
      .catch(err => {
        console.error("[KeywordTracking] error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  // Fetch when user is known
  useEffect(() => {
    if (currentUserId === undefined) return; // still loading auth
    if (!currentUserId) {
      setLoading(false);
      setError("Sign in to see keyword data.");
      return;
    }
    fetchKeywords();
  }, [currentUserId]);

  // Tell AppTourProvider the page is ready
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "keyword-tracking" } })
    );
  }, []);

  const liftColor = (lift) => {
    if (lift >= 2) return "green";
    if (lift >= 1.2) return "blue";
    if (lift >= 0.8) return "gray";
    return "red";
  };

  return (
    <div ref={ref}>
      <Card withBorder shadow="xs" radius="lg" p="lg">
        <Group justify="space-between" align="center" mb="md">
          <div>
            <Title order={3}>Keyword Analysis</Title>
            <Text size="sm" c="dimmed">
              Keywords ranked by how overrepresented they are in your top-performing posts
            </Text>
          </div>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={loading}
            onClick={fetchKeywords}
            disabled={!currentUserId}
          >
            Refresh
          </Button>
        </Group>

        {meta && (
          <Text size="xs" c="dimmed" mb="sm">
            {meta.debug}
          </Text>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md" mb="md">
            {error}
          </Alert>
        )}

        {/* Column headers */}
        {!loading && keywords.length > 0 && (
          <Group px="xs" mb="xs">
            <Text size="xs" c="dimmed" fw={600} style={{ flex: 1 }}>KEYWORD</Text>
            <Text size="xs" c="dimmed" fw={600} w={60} ta="center">LIFT</Text>
            <Text size="xs" c="dimmed" fw={600} w={80} ta="center">IN TOP %</Text>
            <Text size="xs" c="dimmed" fw={600} w={80} ta="center">OVERALL %</Text>
            <Text size="xs" c="dimmed" fw={600} w={60} ta="center">POSTS</Text>
          </Group>
        )}

        <Stack gap="xs">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} withBorder radius="md" p="sm">
                <Group>
                  <Skeleton height={14} width="40%" radius="sm" />
                  <Skeleton height={14} width={40} radius="sm" ml="auto" />
                  <Skeleton height={14} width={60} radius="sm" />
                  <Skeleton height={14} width={60} radius="sm" />
                  <Skeleton height={14} width={40} radius="sm" />
                </Group>
              </Card>
            ))
          ) : keywords.length === 0 ? (
            <Card withBorder radius="md" p="xl">
              <Text c="dimmed" ta="center">
                No keywords found. Try refreshing, or check that your saved posts contain text.
              </Text>
            </Card>
          ) : (
            keywords.map((kw) => (
              <Card key={kw.term} withBorder radius="md" p="sm">
                <Group align="center">
                  <Text fw={500} style={{ flex: 1 }}>{kw.term}</Text>

                  <Tooltip label={`Lift score: keyword appears ${kw.lift}x more in top posts than average`} withArrow>
                    <Badge color={liftColor(kw.lift)} variant="filled" w={60} ta="center">
                      {kw.lift}x
                    </Badge>
                  </Tooltip>

                  <Tooltip label={`Found in ${kw.topFreq}% of your top-performing posts`} withArrow>
                    <Text size="sm" w={80} ta="center" fw={500}>
                      {kw.topFreq}%
                    </Text>
                  </Tooltip>

                  <Tooltip label={`Found in ${kw.overallFreq}% of all your posts`} withArrow>
                    <Text size="sm" w={80} ta="center" c="dimmed">
                      {kw.overallFreq}%
                    </Text>
                  </Tooltip>

                  <Tooltip label={`Appears in ${kw.sampleSize} posts total`} withArrow>
                    <Text size="sm" w={60} ta="center" c="dimmed">
                      {kw.sampleSize}
                    </Text>
                  </Tooltip>
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </Card>
    </div>
  );
});

export default KeywordTracking;