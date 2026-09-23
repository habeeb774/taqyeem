import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const allowed = new Set(['image/png','image/jpeg','image/webp']);
const extension:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
export const DESIGN_BUCKET=process.env.NEON_DESIGN_BUCKET||'design-assets';

function client(){
  if(!process.env.AWS_ENDPOINT_URL_S3||!process.env.AWS_ACCESS_KEY_ID||!process.env.AWS_SECRET_ACCESS_KEY) throw Object.assign(new Error('OBJECT_STORAGE_NOT_CONFIGURED'),{status:503});
  return new S3Client({region:process.env.AWS_REGION||'us-east-2',endpoint:process.env.AWS_ENDPOINT_URL_S3,forcePathStyle:true,credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
}

export async function uploadDesignAsset(file:File,organizationId:string,folder:'backgrounds'|'generated'){
  if(!allowed.has(file.type))throw Object.assign(new Error('UNSUPPORTED_IMAGE_TYPE'),{status:415});
  if(file.size<=0||file.size>15*1024*1024)throw Object.assign(new Error('IMAGE_TOO_LARGE'),{status:413});
  const key=`organizations/${organizationId}/designs/${folder}/${randomUUID()}.${extension[file.type]}`;
  const bytes=Buffer.from(await file.arrayBuffer());
  await client().send(new PutObjectCommand({Bucket:DESIGN_BUCKET,Key:key,Body:bytes,ContentType:file.type,CacheControl:'private, max-age=3600'}));
  return {key,url:`/api/design-assets/${key.split('/').map(encodeURIComponent).join('/')}`};
}

export async function readDesignAsset(key:string){
  const object=await client().send(new GetObjectCommand({Bucket:DESIGN_BUCKET,Key:key}));
  return {bytes:await object.Body?.transformToByteArray(),contentType:object.ContentType||'application/octet-stream'};
}

export async function deleteDesignAsset(key:string){if(!key)return;await client().send(new DeleteObjectCommand({Bucket:DESIGN_BUCKET,Key:key}));}
