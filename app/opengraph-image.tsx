import { ImageResponse } from 'next/og';
export const alt = 'PU-FOP — Parul University Faculty of Pharmacy Research Portal';
export const size = {width:1200,height:630};
export const contentType = 'image/png';
export default function Image(){return new ImageResponse(<div style={{display:'flex',flexDirection:'column',justifyContent:'center',width:'100%',height:'100%',padding:80,background:'#1d4ed8',color:'white'}}><div style={{fontSize:34,marginBottom:35}}>PARUL UNIVERSITY · FACULTY OF PHARMACY</div><div style={{fontSize:100,fontWeight:700}}>PU-FOP</div><div style={{fontSize:42,marginTop:25}}>Research titles. Assignments. Presentations.</div></div>,size);}
