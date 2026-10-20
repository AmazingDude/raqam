import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const size = { width:192, height:192 };
export const contentType = 'image/png';

export default async function RaqamIcon() {
  const artwork = await readFile(join(process.cwd(), 'public/brand/raqam-mark.png'));
  return new ImageResponse(
    <div style={{ display:'flex', width:'100%', height:'100%' }}>
      <img alt="" src={`data:image/png;base64,${artwork.toString('base64')}`} width={size.width} height={size.height} />
    </div>,
    size,
  );
}
