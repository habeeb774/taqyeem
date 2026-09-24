import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const allowedTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const extensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const allowedExtensions = new Set(['pdf', 'doc', 'docx']);
const MAX_CV_SIZE = 5 * 1024 * 1024;

export const CV_BUCKET = process.env.NEON_RECRUITMENT_BUCKET || 'recruitment-cv';

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

export async function uploadCv(file: File, organizationId: string) {
  const originalExtension = (file.name.split('.').pop() || '').toLowerCase();

  if (!allowedTypes.has(file.type) || !allowedExtensions.has(originalExtension)) {
    throw Object.assign(new Error('UNSUPPORTED_CV_TYPE'), { status: 415 });
  }

  if (file.size <= 0 || file.size > MAX_CV_SIZE) {
    throw Object.assign(new Error('CV_TOO_LARGE'), { status: 413 });
  }

  const key = `organizations/${organizationId}/applications/${randomUUID()}.${extensions[file.type]}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await client().send(
    new PutObjectCommand({
      Bucket: CV_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: file.type,
      CacheControl: 'private, max-age=3600',
    }),
  );

  return { key, size: file.size, mimeType: file.type, fileName: file.name };
}

export async function readCv(key: string) {
  const object = await client().send(new GetObjectCommand({ Bucket: CV_BUCKET, Key: key }));

  return {
    bytes: await object.Body?.transformToByteArray(),
    contentType: object.ContentType || 'application/octet-stream',
  };
}
