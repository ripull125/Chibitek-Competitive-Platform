-- Chibitek Competitive Platform Database Schema
-- Supabase / PostgreSQL schema export
-- Note: This file stores the database table structure for project documentation and transfer purposes.

CREATE TABLE public.platforms (
  id integer NOT NULL DEFAULT nextval('platforms_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  api_base_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT platforms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.competitors (
  id integer NOT NULL DEFAULT nextval('competitors_id_seq'::regclass),
  platform_id integer NOT NULL,
  platform_user_id text NOT NULL,
  display_name text,
  profile_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT competitors_pkey PRIMARY KEY (id),
  CONSTRAINT competitors_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id)
);

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  email text,
  name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  role text NOT NULL DEFAULT 'user'::text CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'owner'::text])),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.posts (
  id bigint NOT NULL DEFAULT nextval('posts_id_seq'::regclass),
  platform_id integer NOT NULL,
  competitor_id integer NOT NULL,
  platform_post_id text NOT NULL,
  url text,
  content text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  tone text,
  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id),
  CONSTRAINT posts_competitor_id_fkey FOREIGN KEY (competitor_id) REFERENCES public.competitors(id),
  CONSTRAINT saved_posts_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.post_details_platform (
  id bigint NOT NULL DEFAULT nextval('post_details_platform_id_seq'::regclass),
  post_id bigint NOT NULL,
  video_duration_sec integer,
  image_count integer,
  extra_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_details_platform_pkey PRIMARY KEY (id),
  CONSTRAINT post_details_platform_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);

CREATE TABLE public.post_metrics (
  id bigint NOT NULL DEFAULT nextval('post_metrics_id_seq'::regclass),
  post_id bigint NOT NULL,
  snapshot_at timestamp with time zone NOT NULL,
  likes integer,
  shares integer,
  comments integer,
  other_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  views bigint,
  CONSTRAINT post_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT post_metrics_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);

CREATE TABLE public.storage_objects (
  id bigint NOT NULL DEFAULT nextval('storage_objects_id_seq'::regclass),
  post_id bigint,
  bucket_name text NOT NULL,
  object_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT storage_objects_pkey PRIMARY KEY (id),
  CONSTRAINT storage_objects_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);

CREATE TABLE public.topics (
  id integer NOT NULL DEFAULT nextval('topics_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT topics_pkey PRIMARY KEY (id)
);

CREATE TABLE public.post_topics (
  post_id bigint NOT NULL,
  topic_id integer NOT NULL,
  CONSTRAINT post_topics_pkey PRIMARY KEY (post_id, topic_id),
  CONSTRAINT post_topics_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_topics_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);

CREATE TABLE public.chat_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  conversation jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  CONSTRAINT chat_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT chats_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.watchlist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['x'::text, 'youtube'::text, 'reddit'::text, 'linkedin'::text, 'instagram'::text, 'tiktok'::text])),
  scrape_type text NOT NULL,
  target text NOT NULL,
  label text,
  config jsonb DEFAULT '{}'::jsonb,
  enabled boolean DEFAULT true,
  last_run_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  last_result jsonb,
  CONSTRAINT watchlist_items_pkey PRIMARY KEY (id),
  CONSTRAINT watchlist_user_tk FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.admins (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  email text NOT NULL UNIQUE,
  created_by_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admins_pkey PRIMARY KEY (id)
);
