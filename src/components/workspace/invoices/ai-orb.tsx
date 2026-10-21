import { Mark } from '../../ui/icon.tsx';

export function AIOrb({ size = 38 }: { size?: number }) {
  return <span role="img" aria-label="Raqam AI" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:size,height:size,background:'var(--surface)',borderRadius:'50%',boxShadow:'var(--rq-shadow)'}}><Mark size={size}/></span>;
}
