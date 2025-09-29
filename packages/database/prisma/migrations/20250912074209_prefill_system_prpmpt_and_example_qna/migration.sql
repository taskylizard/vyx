-- AlterTable
ALTER TABLE "public"."query_engine_settings" ALTER COLUMN "personality" SET DEFAULT '<personality></personality>',
ALTER COLUMN "example_qna" SET DEFAULT '<example><question></question><bad_answer></bad_answer><bad_points></bad_points><good_answer></good_answer></example>',
ALTER COLUMN "system_prompt" SET DEFAULT 'You have access to a tool that allows you to view the documentation. Make sure to use it for every query.';
