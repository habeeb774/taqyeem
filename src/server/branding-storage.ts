import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { CV_BUCKET } from '@/server/recruitment-storage';

export const BRANDING_LOGO_PREFIX = 'branding/logo';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const imageExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};
const MAX_LOGO_SIZE = 2 * 1024 * 1024;

function client() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw Object.assign(new Error('OBJECT_STORAGE_NOT_CONFIGURED'), { status: 503 });
  }

  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadBrandLogo(file: File, organizationId: string) {
  if (!imageTypes.has(file.type)) {
    throw Object.assign(new Error('UNSUPPORTED_IMAGE_TYPE'), { status: 415 });
  }
  if (file.size <= 0 || file.size > MAX_LOGO_SIZE) {
    throw Object.assign(new Error('IMAGE_TOO_LARGE'), { status: 413 });
  }

  const key = `organizations/${organizationId}/branding/logo/${randomUUID()}.${imageExtensions[file.type]}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await client().send(
    new PutObjectCommand({
      Bucket: CV_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return { key, url: `/api/app/admin/branding/logo/${key.split('/').map(encodeURIComponent).join('/')}` };
}

export async function readBrandLogo(key: string) {
  const object = await client().send(new GetObjectCommand({ Bucket: CV_BUCKET, Key: key }));

  return {
    bytes: await object.Body?.transformToByteArray(),
    contentType: object.ContentType || 'application/octet-stream',
  };
}
