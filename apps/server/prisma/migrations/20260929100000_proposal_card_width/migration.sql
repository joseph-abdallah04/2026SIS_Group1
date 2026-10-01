-- A sticky's measured width, so new cards can be placed clear of it. Nullable:
-- other kinds of card are a fixed width, and stickies already on a board are
-- treated as the largest a sticky can be until they are next edited.
ALTER TABLE "proposals" ADD COLUMN "card_width" INTEGER;
