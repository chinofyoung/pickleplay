-- Per-court hero image, shown as the card thumbnail across search & club pages.
alter table courts add column if not exists image_url text;
