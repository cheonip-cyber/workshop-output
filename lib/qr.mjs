
/* QR Model 2, version 4-L, byte mode, mask 0. Covers LAN invitation URLs up to 78 bytes. */
export function qrSvg(value) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 78) throw new Error('QR URL too long');
  const bits=[];
  const append=(n,width)=>{for(let i=width-1;i>=0;i--) bits.push((n>>i)&1);};
  append(4,4);append(bytes.length,8);
  for(const b of bytes) append(b,8);
  append(0,4);
  while(bits.length%8) bits.push(0);
  const data=[];
  for(let i=0;i<bits.length;i+=8) data.push(bits.slice(i,i+8).reduce((a,b)=>(a<<1)|b,0));
  for(let i=0;data.length<80;i++) data.push(i%2===0 ? 236:17);
  const mul=(a,b)=>{
    let result=0;
    for(let i=0;i<8;i++){if(b&1)result^=a;b>>=1;a=(a<<1)^((a&128)?285:0);}
    return result;
  };
  let generator=[1],root=1;
  for(let i=0;i<20;i++){
    const next=new Array(generator.length+1).fill(0);
    generator.forEach((a,j)=>{next[j]^=a;next[j+1]^=mul(a,root);});
    generator=next;root=mul(root,2);
  }
  const block=[...data,...new Array(20).fill(0)];
  for(let i=0;i<80;i++){
    const lead=block[i];
    for(let j=0;j<generator.length;j++) block[i+j]^=mul(generator[j],lead);
  }
  bits.length=0;
  for(const b of [...data,...block.slice(80)]) append(b,8);
  const n=33;
  const cells=Array.from({length:n},()=>new Array(n).fill(null));
  const set=(x,y,v)=>{if(x>=0&&x<n&&y>=0&&y<n) cells[y][x]=Number(v);};
  for(const [cx,cy] of [[3,3],[29,3],[3,29]]){
    for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
      const d=Math.max(Math.abs(x),Math.abs(y));
      set(cx+x,cy+y,d!==2&&d!==4);
    }
  }
  for(let i=8;i<n-8;i++){set(i,6,i%2===0);set(6,i,i%2===0);}
  for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++) set(26+x,26+y,Math.max(Math.abs(x),Math.abs(y))!==1);
  const format=0x77c4;
  const bit=i=>(format>>i)&1;
  for(let i=0;i<=5;i++) set(8,i,bit(i));
  set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
  for(let i=9;i<15;i++) set(14-i,8,bit(i));
  for(let i=0;i<8;i++) set(n-1-i,8,bit(i));
  for(let i=8;i<15;i++) set(8,n-15+i,bit(i));
  set(8,n-8,1);
  let pos=0,up=true;
  for(let right=n-1;right>0;right-=2){
    if(right===6)right=5;
    for(let v=0;v<n;v++){
      const y=up?n-1-v:v;
      for(let x=right;x>=right-1;x--)if(cells[y][x]===null) set(x,y,(bits[pos++]??0)^Number((x+y)%2===0));
    }
    up=!up;
  }
  const path=cells.flatMap((row,y)=>row.map((v,x)=>v?'M'+(x+4)+' '+(y+4)+'h1v1h-1z':'')).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41" shape-rendering="crispEdges"><rect width="41" height="41" fill="white"/><path d="'+path+'"/></svg>';
}

