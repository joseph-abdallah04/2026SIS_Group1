-- A sticky's measured size, so new cards can be placed clear of it. A sticky
-- is square unless its note fits no square, when it grows taller, so both are
-- kept. Nullable: other kinds of card are a fixed size, and stickies already on
-- a board are treated as the largest square until they are next edited.
ALTER TABLE "proposals" ADD COLUMN "card_width" INTEGER;
ALTER TABLE "proposals" ADD COLUMN "card_height" INTEGER;
