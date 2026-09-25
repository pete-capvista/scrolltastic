import type { ValidateFunction } from 'ajv';
import type { StoryDocument } from '../model/story.generated';
declare const validate: ValidateFunction<StoryDocument>;
export { validate };
export default validate;
