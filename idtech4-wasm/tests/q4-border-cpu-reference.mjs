// Independent double-precision UV, finite-difference LOD and RGBA8 mip oracle.
// No production helper, driver LOD query or GPU output feeds these equations.
export function borderReference({size:[width,height],borderAlpha,gradientMode},x,y,derivatives='fine') {
  const last=Math.floor(Math.log2(Math.max(width,height)));
  const axis=(i,n)=>[-1,-0.5/n,0,0.25/n,0.5/n,0.5,1-0.25/n,1,1+0.25/n,1+0.5/n,2][Math.min(i,10)];
  const coordinate=(px,py)=>{
    const divisor=gradientMode===3?0.75+(px+0.5)*0.04:1;
    return [axis(px,width)/divisor,axis(py,height)/divisor];
  };
  const uv=coordinate(x,y),left=x-x%2,bottom=y-y%2;
  const dxY=derivatives==='coarse'?bottom:y,dyX=derivatives==='coarse'?left:x;
  const dx=coordinate(left+1,dxY).map((v,i)=>v-coordinate(left,dxY)[i]);
  const dy=coordinate(dyX,bottom+1).map((v,i)=>v-coordinate(dyX,bottom)[i]);
  const rho=Math.max(Math.hypot(dx[0]*width,dx[1]*height),Math.hypot(dy[0]*width,dy[1]*height));
  const lod=Math.min(last,Math.max(0,Math.log2(Math.max(rho,1e-6))));
  const border=[0,0,0,borderAlpha*255];
  const texel=(tx,ty,level)=>{
    const w=Math.max(1,width>>level),h=Math.max(1,height>>level);
    if(tx<0||ty<0||tx>=w||ty>=h)return border;
    return [40+(tx*29+level*23)%170,50+(ty*31+level*19)%150,60+((tx+ty)*17+level*11)%160,80+(tx*13+ty*7+level*37)%170];
  };
  const sample=level=>{
    const px=uv[0]*Math.max(1,width>>level)-0.5,py=uv[1]*Math.max(1,height>>level)-0.5;
    const tx=Math.floor(px),ty=Math.floor(py),fx=px-tx,fy=py-ty;
    const value=[0,0,0,0];
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){
      const pixel=texel(tx+ox,ty+oy,level),weight=(ox?fx:1-fx)*(oy?fy:1-fy);
      for(let c=0;c<4;c++)value[c]+=pixel[c]*weight;
    }
    return value;
  };
  const low=Math.floor(lod),fraction=lod-low,a=sample(low),b=sample(Math.min(last,low+1));
  return a.map((v,i)=>Math.round(v*(1-fraction)+b[i]*fraction));
}
