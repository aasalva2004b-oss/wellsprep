import { useEffect, useState } from 'react';
import { getLocalDateString } from '../lib/utils';

/** Refresh day-dependent projections at local midnight and after device sleep. */
export function useLocalDay(): string {
  const [day,setDay]=useState(()=>getLocalDateString());
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const update=()=>{
      setDay(getLocalDateString());clearTimeout(timer);
      const now=new Date(),next=new Date(now);next.setHours(24,0,0,20);
      timer=setTimeout(update,Math.max(20,next.getTime()-now.getTime()));
    };
    const visible=()=>{if(document.visibilityState!=='hidden')update();};
    update();window.addEventListener('focus',update);document.addEventListener('visibilitychange',visible);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return day;
}
