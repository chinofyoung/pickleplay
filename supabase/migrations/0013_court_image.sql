-- Per-court hero image, shown as the card thumbnail across search & pickleball court pages.
alter table courts add column if not exists image_url text;
