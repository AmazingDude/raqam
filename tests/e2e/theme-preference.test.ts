import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { resolveTheme,THEME_STORAGE_KEY,themeInitScript } from '../../src/lib/client/theme.ts';

function initialize(saved:unknown,blocked=false) {
  const element={dataset:{theme:'uninitialized'}};
  runInNewContext(themeInitScript,{document:{documentElement:element},localStorage:{getItem:(key:string)=>{assert.equal(key,THEME_STORAGE_KEY);if(blocked)throw new Error('Storage blocked');return saved;}}});
  return element.dataset.theme;
}
test('first paint uses the requested grey default and restores a saved light choice',()=>{
  assert.equal(initialize(null),'dark');
  assert.equal(initialize('light'),'light');
  assert.equal(initialize('dark'),'dark');
});
test('invalid or unavailable storage leaves a usable default appearance',()=>{
  assert.equal(initialize('invalid'),'dark');
  assert.equal(initialize('light',true),'dark');
  assert.equal(resolveTheme(undefined),'dark');
  assert.equal(resolveTheme('light'),'light');
});

const css=readFileSync(new URL('../../src/app/theme.css',import.meta.url),'utf8');
function colors(block:string):Record<string,string> {
  return Object.fromEntries([...block.matchAll(/--rq-([\w-]+):\s*(#[\da-f]{6});/g)].map(match=>[match[1]!,match[2]!]));
}
function luminance(hex:string) {
  const channel=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*channel[0]!+.7152*channel[1]!+.0722*channel[2]!;
}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const dark=colors(css.match(/:root \{([\s\S]*?)\}/)![1]!);
const light={...dark,...colors(css.match(/:root\[data-theme='light'\] \{([\s\S]*?)\}/)![1]!)};
for(const [name,palette] of Object.entries({dark,light})) {
  test(`${name} text, actions and status tokens meet AA contrast`,()=>{
    for(const surface of ['canvas','surface','surface-2'])for(const text of ['ink','muted']) {
      const ratio=contrast(palette[text]!,palette[surface]!);
      assert.ok(ratio>=4.5,`${text} on ${surface}: ${ratio.toFixed(2)}`);
    }
    for(const [foreground,background] of [['accent','accent-bg'],['warning','warning-bg'],['danger','danger-bg'],['info','info-bg'],['pink','pink-bg'],['on-action','action'],['on-action','action-hover'],['on-accent','accent'],['selected-ink','selected'],['chart-ink','surface']]) {
      const ratio=contrast(palette[foreground!]!,palette[background!]!);
      assert.ok(ratio>=4.5,`${foreground} on ${background}: ${ratio.toFixed(2)}`);
    }
    assert.ok(contrast(palette['field-border']!,palette.surface!)>=3,'interactive field boundary contrast');
  });
}
