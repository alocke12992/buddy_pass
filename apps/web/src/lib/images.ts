/**
 * Exercise images are stored as relative paths (e.g. "Barbell_Squat/0.jpg");
 * the base URL is environment-shaped: local static folder in dev (fetched via
 * `pnpm db:images`), S3/CloudFront once INFRA milestone 6 flips the env var.
 */
const IMAGE_BASE_URL: string =
  (import.meta.env.VITE_IMAGE_BASE_URL as string | undefined) ?? '/exercise-images';

export function exerciseImageUrl(relativePath: string): string {
  return `${IMAGE_BASE_URL}/${relativePath}`;
}
