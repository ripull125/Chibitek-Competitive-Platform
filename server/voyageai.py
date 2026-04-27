import os
import voyageai
from supabase import create_client

# Supabase client (server-side key is OK here)
supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

def fetch_post_strings(limit=200, user_id=None):
    query = (
        supabase.table("posts")
        .select("content, url, published_at, platform_id")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if user_id:
        query = query.eq("user_id", user_id)

    result = query.execute()
    rows = result.data or []

    # Build list[str] for embeddings
    documents = []
    for row in rows:
        content = (row.get("content") or "").strip()
        url = (row.get("url") or "").strip()
        published_at = row.get("published_at") or ""
        pieces = [content]
        if url:
            pieces.append(f"URL: {url}")
        if published_at:
            pieces.append(f"Published: {published_at}")
        documents.append("\n".join([p for p in pieces if p]))

    return documents

documents = fetch_post_strings(limit=200)

vo = voyageai.Client()
batch_size = 128
documents_embeddings = [
    vo.embed(
        documents[i : i + batch_size],
        model="voyage-4-large",
        input_type="document",
    ).embeddings
    for i in range(0, len(documents), batch_size)
]
