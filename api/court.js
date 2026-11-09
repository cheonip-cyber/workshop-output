
import {get, put, BlobPreconditionFailedError} from '@vercel/blob';
import {makeHandler, decode} from '../lib/court.mjs';

const path = code => 'sm-court/v1/'+code+'.json';
const store = {
  async read(code){
    const found=await get(path(code),{access:'private',useCache:false});
    if(!found)return null;
    return {room:decode(await new Response(found.stream).json()),tag:found.blob.etag};
  },
  async write(code,value,tag){
    try{
      await put(path(code),value,{access:'private',addRandomSuffix:false,allowOverwrite:tag!==null,
        ...(tag!==null?{ifMatch:tag}:{}),contentType:'application/json',cacheControlMaxAge:60});
      return true;
    }catch(error){
      if(error instanceof BlobPreconditionFailedError || (tag===null&&/already exists/i.test(error.message)))return false;
      throw error;
    }
  }
};
const handle=makeHandler(store);
export default {
  async fetch(request){
    try{
      const url=new URL(request.url);
      const route=url.searchParams.get('route');
      if(route!==null)url.pathname='/api/'+route.replace(/\/+$/,'');
      const routed=new Request(url,request);
      return await handle(routed);
    }catch(error){
      console.error('Court request failed:',error.name);
      return Response.json({error:'방 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
};
