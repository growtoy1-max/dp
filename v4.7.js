// ==UserScript==
// @name         deneme 5 v4.7
// @namespace    http://tampermonkey.net/
// @version      2026-04-29
// @description  try to take over the world!
// @author       You
// @match        https://diep.io/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=diep.io
// @grant        none
// ==/UserScript==
(function () {
    'use strict';
    if (window.top !== window.self) return;

    // ─── Shape fill colors (exact hex diep.io uses, lowercase) ───────────────
    const SC = { sq: '#ffe869', tr: '#fc7677', pt: '#768dfc', hx: '#35c5db', cr: '#f04f54' };

    const OS = {
        SQUARE:   { s: '#FFE869', f: 'rgba(255,232,105,0.15)' },
        TRIANGLE: { s: '#FC7677', f: 'rgba(252,118,119,0.15)' },
        PENTAGON: { s: '#768DFC', f: 'rgba(118,141,252,0.15)' },
        HEXAGON:  { s: '#35C5DB', f: 'rgba(53,197,219,0.15)'  },
        CRASHER:  { s: '#FF4444', f: 'rgba(255,68,68,0.10)',  d: [4,4] }
    };

    // ─── Spawn / safe-zone bounds (used only for retreat, not farming) ────────
    const TB2 = {
        RED:  { a: 4300, b: 4800, c: 200,  d: 4800 },
        BLUE: { a: 200,  b: 700,  c: 200,  d: 4800 }
    };
    const TB4 = {
        GREEN:  { a: 200,  b: 1000, c: 4000, d: 4800 },
        BLUE:   { a: 200,  b: 1000, c: 200,  d: 1000 },
        PURPLE: { a: 4000, b: 4800, c: 200,  d: 1000 },
        RED:    { a: 4000, b: 4800, c: 4000, d: 4800 }
    };

    // ─── State ────────────────────────────────────────────────────────────────
    let overlayEnabled  = true;
    let farmerActive    = false;
    let autoFireActive  = false;
    let zoomActive      = false;
    let gameMode        = '2TDM';
    let selectedTeam    = null;
    let frameCount      = 0;
    let totalDestroyed  = 0;
    let autoFireInterval = null;

    function getTeamBounds() {
        if (!selectedTeam) return null;
        const bs = (gameMode === '4TDM' ? TB4 : TB2)[selectedTeam];
        if (!bs) return null;
        return { minX: bs.a, maxX: bs.b, minY: bs.c, maxY: bs.d };
    }

    // ─── Zoom hack ────────────────────────────────────────────────────────────
    const ZOOM_FACTOR = 1.6;
    let _zoomInstalled = false;

    function installZoom() {
        if (_zoomInstalled) return;
        _zoomInstalled = true;
        const _iW = window.innerWidth, _iH = window.innerHeight;
        Object.defineProperty(window, 'innerWidth',  {
            get: () => zoomActive ? Math.round(_iW * ZOOM_FACTOR) : _iW,
            configurable: true
        });
        Object.defineProperty(window, 'innerHeight', {
            get: () => zoomActive ? Math.round(_iH * ZOOM_FACTOR) : _iH,
            configurable: true
        });
    }

    function toggleZoom(on) {
        zoomActive = on;
        window.dispatchEvent(new Event('resize'));
    }

    // ─── Geometry helpers ─────────────────────────────────────────────────────
    const G = {
        tP(x, y, m, r) { return { x: (x*m.a + y*m.c + m.e)/r.x, y: (x*m.b + y*m.d + m.f)/r.y } },
        gS(m, r) { return Math.sqrt(m.a*m.a + m.b*m.b) / r.x },
        un(a, b) {
            if (!a) return b; if (!b) return a;
            return { left: Math.min(a.left,b.left), right: Math.max(a.right,b.right),
                     top: Math.min(a.top,b.top),   bottom: Math.max(a.bottom,b.bottom) };
        }
    };

    // ─── Simulated input ──────────────────────────────────────────────────────
    const SI = {
        hK: {},
        mM(x,y) { document.dispatchEvent(new MouseEvent('mousemove',{clientX:x,clientY:y,bubbles:true,cancelable:true})) },
        kD(c) {
            if (this.hK[c]) return;
            const map={87:['w','KeyW'],65:['a','KeyA'],83:['s','KeyS'],68:['d','KeyD'],69:['e','KeyE']};
            const [key,code]=map[c]||['',''];
            document.dispatchEvent(new KeyboardEvent('keydown',{key,code,keyCode:c,which:c,bubbles:true,cancelable:true,composed:true}));
            this.hK[c]=true;
        },
        kU(c) {
            if (!this.hK[c]) return;
            const map={87:['w','KeyW'],65:['a','KeyA'],83:['s','KeyS'],68:['d','KeyD'],69:['e','KeyE']};
            const [key,code]=map[c]||['',''];
            document.dispatchEvent(new KeyboardEvent('keyup',{key,code,keyCode:c,which:c,bubbles:true,cancelable:true,composed:true}));
            this.hK[c]=false;
        },
        sM(dx,dy) {
            if (dy<0){this.kD(87);this.kU(83)} else if(dy>0){this.kD(83);this.kU(87)} else{this.kU(87);this.kU(83)}
            if (dx<0){this.kD(65);this.kU(68)} else if(dx>0){this.kD(68);this.kU(65)} else{this.kU(65);this.kU(68)}
        },
        sP() { this.kU(87);this.kU(83);this.kU(65);this.kU(68) },
        rA() { this.sP(); Object.keys(this.hK).forEach(k=>{if(this.hK[k])this.kU(parseInt(k))}) }
    };

    function setAutoFire(on) {
        if (autoFireInterval) { clearInterval(autoFireInterval); autoFireInterval=null; }
        if (on) {
            autoFireInterval = setInterval(()=>{
                const cx=window.innerWidth/2, cy=window.innerHeight/2;
                document.dispatchEvent(new MouseEvent('mousedown',{clientX:cx,clientY:cy,button:0,bubbles:true,cancelable:true}));
            }, 100);
        } else {
            document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true,cancelable:true}));
        }
    }

    // ─── Smooth mouse mover ───────────────────────────────────────────────────
    const MB = {
        cX:0,cY:0,sX:0,sY:0,ctX:0,ctY:0,tX:0,tY:0,pr:1.0,sp:0.28,
        bz(t,a,b,c){const u=1-t;return u*u*a+2*u*t*b+t*t*c},
        sT(x,y){
            if(this.pr<1){this.cX=this.bz(this.pr,this.sX,this.ctX,this.tX);this.cY=this.bz(this.pr,this.sY,this.ctY,this.tY)}
            this.sX=this.cX;this.sY=this.cY;this.tX=x;this.tY=y;
            const dx=x-this.cX,dy=y-this.cY,d=Math.hypot(dx,dy);
            if(d>20){const p=Math.min(d*0.12,25)*(Math.random()-0.5);this.ctX=(this.cX+x)/2+(-dy/d)*p;this.ctY=(this.cY+y)/2+(dx/d)*p}
            else{this.ctX=(this.cX+x)/2;this.ctY=(this.cY+y)/2}
            this.pr=0;
        },
        up(){
            if(this.pr>=1){SI.mM(this.tX,this.tY);return}
            this.pr=Math.min(1,this.pr+this.sp*(1.2-this.pr*0.5));
            this.cX=this.bz(this.pr,this.sX,this.ctX,this.tX);
            this.cY=this.bz(this.pr,this.sY,this.ctY,this.tY);
            SI.mM(this.cX,this.cY);
        }
    };

    // =========================================================================
    // DYNAMIC ENEMY COLOR DETECTION
    // =========================================================================

    function parseColor(col) {
        if (!col || col.length < 3) return null;
        if (col.startsWith('#')) {
            const h = col.replace('#','');
            if (h.length===6) return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};
            if (h.length===3) return {r:parseInt(h[0]+h[0],16),g:parseInt(h[1]+h[1],16),b:parseInt(h[2]+h[2],16)};
        }
        if (col.startsWith('rgb')) {
            const m=col.match(/(\d+),\s*(\d+),\s*(\d+)/);
            if (m) return {r:+m[1],g:+m[2],b:+m[3]};
        }
        return null;
    }

    function colorDist(a,b) {
        return Math.sqrt((a.r-b.r)**2+(a.g-b.g)**2+(a.b-b.b)**2);
    }

    const TEAM_COLORS = {
        RED:    [{r:241,g:78, b:84 },{r:255,g:70, b:75 },{r:220,g:65, b:70 },{r:240,g:80, b:85 }],
        BLUE:   [{r:0,  g:178,b:225},{r:0,  g:190,b:240},{r:10, g:165,b:210},{r:0,  g:180,b:230}],
        GREEN:  [{r:0,  g:225,b:91 },{r:0,  g:210,b:80 },{r:20, g:220,b:85 },{r:0,  g:200,b:75 }],
        PURPLE: [{r:191,g:127,b:245},{r:180,g:110,b:235},{r:175,g:120,b:250},{r:185,g:125,b:240}]
    };

    const COLOR_THRESH = 55;

    function matchesTeam(col, team) {
        const refs = TEAM_COLORS[team];
        if (!refs) return false;
        const p = parseColor(col);
        if (!p) return false;
        return refs.some(ref => colorDist(p, ref) < COLOR_THRESH);
    }

    function isEnemyColor(col) {
        if (!col || !selectedTeam) return false;
        const colL = col.toLowerCase();
        if (colL===SC.sq||colL===SC.tr||colL===SC.pt||colL===SC.hx||colL===SC.cr) return false;
        if (gameMode==='2TDM') {
            const enemy = selectedTeam==='RED' ? 'BLUE' : 'RED';
            return matchesTeam(colL, enemy);
        } else {
            return ['RED','BLUE','GREEN','PURPLE'].filter(t=>t!==selectedTeam).some(t=>matchesTeam(colL,t));
        }
    }

    // ─── Canvas scanner ───────────────────────────────────────────────────────
    const CS = {
        ac:false, sh:[], ss:[],
        _bRaw:[], _bTrack:new Map(),
        bullets:[], enemyBullets:[],
        cB:null, cC:false, cCR:0, cCX:0, cCY:0, cCCol:'',
        vC:0, cV:[], iC:new WeakSet(),
        _oDI:null, _oGI:null,

        inst() {
            try {
                const w = typeof unsafeWindow!=='undefined' ? unsafeWindow : window;
                const p = w.CanvasRenderingContext2D.prototype;
                const o = {bP:p.beginPath,mT:p.moveTo,lT:p.lineTo,rc:p.rect,ar:p.arc,fl:p.fill,st:p.stroke,dI:p.drawImage,gI:p.getImageData};
                CS._oDI=o.dI; CS._oGI=o.gI;
                const gR=c=>{const cv=c.canvas,dw=cv.clientWidth||cv.width,dh=cv.clientHeight||cv.height;return{x:cv.width/dw,y:cv.height/dh}};
                const s=CS;
                const aP=(c,x,y)=>{
                    const m=c.getTransform(),r=gR(c),pt=G.tP(x,y,m,r);
                    s.cV.push(pt);
                    if(!s.cB)s.cB={left:pt.x,right:pt.x,top:pt.y,bottom:pt.y};
                    else{if(pt.x<s.cB.left)s.cB.left=pt.x;if(pt.x>s.cB.right)s.cB.right=pt.x;if(pt.y<s.cB.top)s.cB.top=pt.y;if(pt.y>s.cB.bottom)s.cB.bottom=pt.y}
                };
                const aA=(c,x,y,r)=>{
                    const m=c.getTransform(),rt=gR(c),ct=G.tP(x,y,m,rt),R=G.gS(m,rt)*r;
                    s.cB=G.un(s.cB,{left:ct.x-R,right:ct.x+R,top:ct.y-R,bottom:ct.y+R});
                    s.cC=true;s.cCR=R;s.cCX=ct.x;s.cCY=ct.y;
                    s.cCCol=(typeof c.fillStyle==='string')?c.fillStyle.toLowerCase():'';
                };
                const sI=c=>c.canvas&&s.iC.has(c.canvas);
                p.beginPath=function(){if(!sI(this)){s.cB=null;s.cC=false;s.cCR=0;s.cCCol='';s.vC=0;s.cV=[]}return o.bP.apply(this,arguments)};
                p.moveTo=function(x,y){if(!sI(this)){aP(this,x,y);s.vC++}return o.mT.apply(this,arguments)};
                p.lineTo=function(x,y){if(!sI(this)){aP(this,x,y);s.vC++}return o.lT.apply(this,arguments)};
                p.rect=function(x,y,w,h){if(!sI(this)){aP(this,x,y);aP(this,x+w,y+h);s.vC=4}return o.rc.apply(this,arguments)};
                p.arc=function(x,y,r){if(!sI(this)){aA(this,x,y,r)}return o.ar.apply(this,arguments)};
                p.fill=function(){if(!sI(this)&&s.cB)s.rec(this);return o.fl.apply(this,arguments)};
                p.stroke=function(){return o.st.apply(this,arguments)};
                this.ac=true;
            } catch(e){}
        },

        rec(ctx) {
            const b=this.cB;
            if(!b)return;
            if(b.right<0||b.left>window.innerWidth||b.bottom<0||b.top>window.innerHeight)return;
            if(b.left<=1&&b.top<=1)return;
            const col=(typeof ctx.fillStyle==='string')?ctx.fillStyle.toLowerCase():'';
            if(this.cC){
                const R=this.cCR;
                if(R>=3&&R<=22){
                    const isSC=col===SC.sq||col===SC.tr||col===SC.pt||col===SC.hx||col===SC.cr;
                    if(!isSC) this._bRaw.push({x:this.cCX,y:this.cCY,r:R,col:this.cCCol||col});
                }
                return;
            }
            let t=null;
            if(col===SC.sq)t='SQUARE';
            else if(col===SC.tr)t='TRIANGLE';
            else if(col===SC.pt)t='PENTAGON';
            else if(col===SC.hx)t='HEXAGON';
            else if(col===SC.cr)t='CRASHER';
            if(!t)return;
            const w=b.right-b.left,h=b.bottom-b.top;
            this.sh.push({x:Math.round((b.left+b.right)/2),y:Math.round((b.top+b.bottom)/2),r:Math.max(w,h)/2,w,h,t,v:this.cV.slice(),n:this.vC});
        },

        tSS() { this.ss=this.sh.slice(); this._trackBullets(); },

        _trackBullets() {
            const now=Date.now(), raw=this._bRaw, next=new Map();
            for(const b of raw){
                let bestKey=null,bestDist=80;
                for(const [key,prev] of this._bTrack){
                    if(next.has(key))continue;
                    const d=Math.hypot(b.x-prev.x,b.y-prev.y);
                    if(d<bestDist){bestDist=d;bestKey=key}
                }
                if(bestKey!==null){
                    const prev=this._bTrack.get(bestKey);
                    next.set(bestKey,{x:b.x,y:b.y,r:b.r,col:b.col,vx:b.x-prev.x,vy:b.y-prev.y,age:(prev.age||0)+1,ts:now});
                } else {
                    next.set('b_'+Math.round(b.x)+'_'+Math.round(b.y)+'_'+now,{x:b.x,y:b.y,r:b.r,col:b.col,vx:0,vy:0,age:0,ts:now});
                }
            }
            this.bullets=[]; this.enemyBullets=[];
            for(const [,bt] of next){
                const spd=Math.hypot(bt.vx,bt.vy);
                if(bt.age>=1&&spd>2){
                    this.bullets.push(bt);
                    if(isEnemyColor(bt.col)) this.enemyBullets.push(bt);
                }
            }
            for(const [key,bt] of this._bTrack){
                if(!next.has(key)&&(now-bt.ts)<150) next.set(key,{...bt,age:bt.age+1,ts:bt.ts});
            }
            this._bTrack=next; this._bRaw=[];
        },

        clr() { this.sh=[]; this._bRaw=[]; }
    };

    // ─── Minimap position estimator ───────────────────────────────────────────
    class PE {
        constructor(){this._w=null;this._p=[];this._lP={X:null,Y:null}}
        _iW(){
            if(this._w)return;
            const wc='self.onmessage=function(e){const{imageData:id,width:w,height:h,threshold:th}=e.data;const d=id.data;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];const v=Math.sqrt(r*r+g*g+b*b)<=th?0:255;d[i]=v;d[i+1]=v;d[i+2]=v;d[i+3]=255}const vi=new Uint8Array(w*h);const ix=(x,y)=>y*w+x;let lg=null;for(let y=0;y<h;y++){for(let x=0;x<w;x++){const st=ix(x,y);if(vi[st])continue;vi[st]=1;if(d[st*4]!==0)continue;const sk=[[x,y]];let c=0,sx=0,sy=0;while(sk.length){const[cx,cy]=sk.pop();c++;sx+=cx;sy+=cy;for(let oy=-1;oy<=1;oy++){for(let ox=-1;ox<=1;ox++){if(!ox&&!oy)continue;const nx=cx+ox,ny=cy+oy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const n=ix(nx,ny);if(vi[n])continue;vi[n]=1;if(d[n*4]===0)sk.push([nx,ny])}}}if(!lg||c>lg.c)lg={c,sx,sy}}}let r={X:null,Y:null};if(lg&&lg.c>0)r={X:lg.sx/lg.c,Y:lg.sy/lg.c};self.postMessage(r)};';
            const bl=new Blob([wc],{type:'application/javascript'});
            this._w=new Worker(URL.createObjectURL(bl));
            this._w.onmessage=e=>{const cb=this._p.shift();if(cb)cb(e.data)};
        }
        _sR(){const a=window.innerHeight/1080,b=window.innerWidth/1920;return b<a?a:b}
        _gS(){return 175*this._sR()}
        _gO(s){return Math.max(10,Math.min(s*0.11,50))}
        _gMM(cv){const r=cv.getBoundingClientRect(),sx=cv.width/r.width,sy=cv.height/r.height,s=this._gS()*sx,o=this._gO(this._gS())*sx;return{x:cv.width-s-o,y:cv.height-s-o,s}}
        gP(){
            this._iW();
            const cv=document.getElementById('canvas');
            if(!cv)return Promise.resolve({X:null,Y:null});
            const{x,y,s}=this._gMM(cv);
            const cr=document.createElement('canvas');
            cr.width=Math.round(s);cr.height=Math.round(s);CS.iC.add(cr);
            const cx=cr.getContext('2d');
            CS._oDI.call(cx,cv,Math.round(x),Math.round(y),Math.round(s),Math.round(s),0,0,Math.round(s),Math.round(s));
            const id=CS._oGI.call(cx,0,0,cr.width,cr.height);
            return new Promise(rs=>{
                this._p.push(d=>{
                    const{X,Y}=d;
                    if(X!==null&&Y!==null){this._lP={X:Math.round((X/Math.max(1,cr.width-1))*5000),Y:Math.round((Y/Math.max(1,cr.height-1))*5000)}}
                    else{this._lP={X:null,Y:null}}
                    rs(this._lP);
                });
                this._w.postMessage({imageData:id,width:cr.width,height:cr.height,threshold:150});
            });
        }
        get last(){return this._lP}
    }

    // ─── Minimap dot overlay ──────────────────────────────────────────────────
    class MO {
        constructor(){this.cn=null;this.dt=null;this.cl=null;this.gs=0;this.vi=false}
        _sR(){const a=window.innerHeight/1080,b=window.innerWidth/1920;return b<a?a:b}
        _gS(){return 175*this._sR()}
        _gO(g){return Math.max(10,Math.min(g*0.10,50))}
        init(){
            const st=document.createElement('style');
            st.textContent='#mde-overlay{position:fixed;z-index:999998;pointer-events:none;display:none;box-sizing:border-box}#mde-dot{position:absolute;width:8px;height:8px;border-radius:50%;background:radial-gradient(circle,#00ff88 30%,#00cc66 100%);border:1.5px solid #fff;box-shadow:0 0 6px 2px rgba(0,255,136,0.6);transform:translate(-50%,-50%);z-index:10;transition:left 0.3s ease-out,top 0.3s ease-out}#mde-coord{position:fixed;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:#00ff88;font:bold 11px Consolas,monospace;padding:3px 8px;border-radius:5px;border:1px solid rgba(0,255,136,0.3);z-index:999999;pointer-events:none;display:none}#mde-coord.active{display:block}';
            const at=()=>{if(!document.head&&!document.documentElement){requestAnimationFrame(at);return}(document.head||document.documentElement).appendChild(st)};at();
            this.cn=document.createElement('div');this.cn.id='mde-overlay';
            this.dt=document.createElement('div');this.dt.id='mde-dot';this.dt.style.display='none';this.cn.appendChild(this.dt);
            this.cl=document.createElement('div');this.cl.id='mde-coord';
            const mn=()=>{if(!document.body){requestAnimationFrame(mn);return}document.body.appendChild(this.cn);document.body.appendChild(this.cl)};mn();
            this._oG();window.addEventListener('resize',()=>this._uS());
        }
        _uS(){if(!this.cn)return;this.gs=this._gS();const o=this._gO(this.gs);Object.assign(this.cn.style,{width:this.gs+'px',height:this.gs+'px',bottom:o+'px',right:o+'px'})}
        _iG(){const h=document.getElementById('home-screen');if(h&&h.classList.contains('screen')&&!h.classList.contains('active'))return true;const g=document.getElementById('in-game-screen');return!!(g&&g.classList.contains('screen')&&g.classList.contains('active'))}
        _oG(){const ck=()=>{const g=this._iG();if(this.cn)this.cn.style.display=g?'block':'none';this.vi=g;if(g)this._uS()};const it=()=>{if(!document.body){requestAnimationFrame(it);return}ck();new MutationObserver(()=>ck()).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})};it()}
        uPP(x,y){
            if(x===null||y===null){if(this.dt)this.dt.style.display='none';this.cl.classList.remove('active');return}
            this.gs=this._gS();const px=Math.round((x/5000)*this.gs),py=Math.round((y/5000)*this.gs);
            if(this.dt){this.dt.style.display='block';this.dt.style.left=px+'px';this.dt.style.top=py+'px'}
            this.cl.textContent='X:'+x+'  Y:'+y;this.cl.classList.add('active');
        }
    }

    // ─── Farmer ───────────────────────────────────────────────────────────────
    const FM = {
        cT:null, wD:{dx:0,dy:0}, lWC:0, st:'IDLE',
        _retreatUntil:0,

        _scoreTarget(s,cx,cy){
            const dist=Math.hypot(s.x-cx,s.y-cy);
            if(s.t==='PENTAGON'&&dist<300)return dist*0.4;
            if(s.t==='HEXAGON')return dist*0.85;
            if(s.t==='TRIANGLE')return dist*0.95;
            return dist;
        },

        _gAv(sh,cx,cy,ignore){
            let ax=0,ay=0;
            const AVOID_R=65;
            for(const s of sh){
                if(s===ignore)continue;
                const dx=s.x-cx,dy=s.y-cy,d=Math.hypot(dx,dy),e=d-s.r;
                if(e<AVOID_R&&d>0){const f=(AVOID_R-e)/AVOID_R;ax-=(dx/d)*f;ay-=(dy/d)*f}
            }
            return{x:ax,y:ay};
        },

        up(pe){
            if(!farmerActive||!selectedTeam){this.cT=null;this.st='IDLE';SI.sP();return}
            const ps=pe.last, bn=getTeamBounds();
            if(ps.X===null||ps.Y===null){this.st='IDLE';SI.sP();return}
            const cx=window.innerWidth/2, cy=window.innerHeight/2;
            const sh=CS.ss, now=Date.now();

            if(this.cT){
                const still=sh.some(s=>s.t===this.cT.t&&Math.hypot(s.x-this.cT.x,s.y-this.cT.y)<40);
                if(!still){totalDestroyed++;this.cT=null;}
            }

            if(CS.enemyBullets.length>0){
                this._retreatUntil=now+2000;
                this.st='RETREATING'; this.cT=null;
                if(bn){
                    const cnX=(bn.minX+bn.maxX)/2, cnY=(bn.minY+bn.maxY)/2;
                    const dx=ps.X<cnX?1:ps.X>cnX+100?-1:0;
                    const dy=ps.Y<cnY?1:ps.Y>cnY+100?-1:0;
                    SI.sM(dx,dy); MB.sT(cx+dx*300,cy+dy*300);
                } else SI.sP();
                return;
            }

            if(now<this._retreatUntil&&bn){
                this.st='RETURNING'; this.cT=null;
                const cnX=(bn.minX+bn.maxX)/2, cnY=(bn.minY+bn.maxY)/2;
                const inSafe=ps.X>=bn.minX&&ps.X<=bn.maxX&&ps.Y>=bn.minY&&ps.Y<=bn.maxY;
                if(!inSafe){
                    const dx=ps.X<cnX?1:ps.X>cnX+100?-1:0;
                    const dy=ps.Y<cnY?1:ps.Y>cnY+100?-1:0;
                    SI.sM(dx,dy); MB.sT(cx+dx*300,cy+dy*300);
                } else SI.sP();
                return;
            }

            let best=null, bestScore=Infinity;
            for(const s of sh){
                if(s.t==='CRASHER')continue;
                if(s.x>window.innerWidth*0.82&&s.y>window.innerHeight*0.82)continue;
                const score=this._scoreTarget(s,cx,cy);
                if(score<bestScore){bestScore=score;best=s;}
            }

           if(best){
    this.st='FARMING'; 
    this.cT=best; 
    MB.sT(best.x, best.y);

    const dx = best.x - cx; 
    const dy = best.y - cy; 
    const dist = Math.hypot(dx, dy);

    // Hexagon için daha geniş bir güvenlik mesafesi tanımlıyoruz
    // Hexagon (hx) diep.io'da daha iticidir, bu yüzden 20 yerine en az 45-50 birim bırakmalıyız.
    let safePadding = 25; 
    if (best.t === 'HEXAGON') {
        safePadding = 50; // Hexagon'a çok yaklaşma, çarparsan ölürsün
    } else if (best.t === 'PENTAGON') {
        safePadding = 35;
    }

    const stopDist = best.r + safePadding;

    let mx = 0, my = 0;
    if(dist > stopDist + 15){ 
        // Hedefe hala uzağız, gitmeye devam et
        mx = Math.sign(dx / dist); 
        my = Math.sign(dy / dist);
    } else if(dist < stopDist){ 
        // ÇOK YAKLAŞTIK! Geri kaç (Bu satır çarpmayı önler)
        mx = -Math.sign(dx / dist); 
        my = -Math.sign(dy / dist);
    }

    const av = this._gAv(sh, cx, cy, best);
    if(Math.abs(av.x) > 0.5) mx += av.x > 0 ? 1 : -1;
    if(Math.abs(av.y) > 0.5) my += av.y > 0 ? 1 : -1;
    
    SI.sM(Math.max(-1, Math.min(1, mx)), Math.max(-1, Math.min(1, my)));
}
            } else {
                this.st='WANDERING'; this.cT=null;
                if(now-this.lWC>1000){
                    this.lWC=now;
                    const mapCX=2500,mapCY=2500;
                    this.wD={
                        dx:ps.X<mapCX-400?1:ps.X>mapCX+400?-1:(Math.random()>0.5?1:-1),
                        dy:ps.Y<mapCY-400?1:ps.Y>mapCY+400?-1:(Math.random()>0.5?1:-1)
                    };
                }
                const av=this._gAv(sh,cx,cy,null);
                let dx=this.wD.dx,dy=this.wD.dy;
                if(Math.abs(av.x)>0.3)dx+=av.x>0?1:-1;
                if(Math.abs(av.y)>0.3)dy+=av.y>0?1:-1;
                SI.sM(Math.max(-1,Math.min(1,dx)),Math.max(-1,Math.min(1,dy)));
                MB.sT(cx+dx*300,cy+dy*300);
            }
        }
    };

    // ─── Overlay renderer ─────────────────────────────────────────────────────
    const SO = {
        cv:null, cx:null,
        init(){
            this.cv=document.createElement('canvas');
            this.cv.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:90001';
            document.body.appendChild(this.cv);
            this.cx=this.cv.getContext('2d');
            CS.iC.add(this.cv);
        },
        ren(){
            if(!this.cv||!this.cx)return;
            this.cv.width=window.innerWidth;this.cv.height=window.innerHeight;
            this.cx.clearRect(0,0,this.cv.width,this.cv.height);
            if(!overlayEnabled)return;
            const cx=window.innerWidth/2,cy=window.innerHeight/2;
            for(const s of CS.ss){const st=OS[s.t];if(st)this._dS(s,st)}
            for(const b of CS.bullets){
                const spd=Math.hypot(b.vx,b.vy);if(spd<2)continue;
                const enemy=isEnemyColor(b.col);
                this.cx.save();
                this.cx.strokeStyle=enemy?'rgba(255,60,60,0.85)':'rgba(100,200,255,0.4)';
                this.cx.lineWidth=enemy?2:1;
                this.cx.setLineDash([3,3]);
                this.cx.beginPath();this.cx.moveTo(b.x,b.y);this.cx.lineTo(b.x+b.vx*8,b.y+b.vy*8);this.cx.stroke();
                this.cx.setLineDash([]);
                this.cx.beginPath();this.cx.arc(b.x,b.y,Math.max(3,b.r),0,Math.PI*2);
                this.cx.strokeStyle=enemy?'rgba(255,60,60,0.6)':'rgba(80,180,255,0.3)';
                this.cx.stroke();
                this.cx.restore();
            }
            if(farmerActive&&FM.cT){
                const t=FM.cT;
                const col=FM.st==='RETREATING'?'#ff4444':FM.st==='RETURNING'?'#ffaa00':'#00ffcc';
                this.cx.save();
                this.cx.strokeStyle=col;this.cx.lineWidth=1.5;this.cx.globalAlpha=0.5;this.cx.setLineDash([5,4]);
                this.cx.beginPath();this.cx.moveTo(cx,cy);this.cx.lineTo(t.x,t.y);this.cx.stroke();
                this.cx.setLineDash([]);this.cx.globalAlpha=1;
                this.cx.beginPath();this.cx.moveTo(t.x-10,t.y);this.cx.lineTo(t.x+10,t.y);this.cx.moveTo(t.x,t.y-10);this.cx.lineTo(t.x,t.y+10);this.cx.stroke();
                this.cx.beginPath();this.cx.arc(t.x,t.y,t.r+5,0,Math.PI*2);this.cx.stroke();
                this.cx.restore();
            }
        },
        _dS(s,st){
            const c=this.cx;c.save();
            c.strokeStyle=st.s;c.fillStyle=st.f;c.lineWidth=1.5;c.globalAlpha=0.8;
            c.setLineDash(st.d||[]);
            const v=s.v;
            if(v&&v.length>=3){c.beginPath();c.moveTo(v[0].x,v[0].y);for(let i=1;i<v.length;i++)c.lineTo(v[i].x,v[i].y);c.closePath();c.fill();c.stroke()}
            else{c.beginPath();c.rect(s.x-s.w/2,s.y-s.h/2,s.w,s.h);c.fill();c.stroke()}
            c.restore();
        }
    };

    // =========================================================================
    // UI
    // =========================================================================
    const UI = {
        rt:null, vi:true,

        init(){
            const style=document.createElement('style');
            style.textContent=[
                '#sf{position:fixed;top:16px;right:16px;width:260px;background:rgba(10,11,18,0.92);border:1px solid rgba(255,255,255,0.08);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.06);z-index:999999;pointer-events:auto;user-select:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:#c8c8d8;overflow:hidden}',
                '#sf-hd{padding:12px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px}',
                '#sf-hd-dot{width:8px;height:8px;border-radius:50%;background:#00ffaa;box-shadow:0 0 6px #00ffaa;flex-shrink:0}',
                '#sf-hd-title{font-size:13px;font-weight:700;color:#fff;letter-spacing:0.3px;flex:1}',
                '#sf-hd-ver{font-size:10px;color:rgba(255,255,255,0.25);font-variant-numeric:tabular-nums}',
                '#sf-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}',
                '.sf-label{font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:5px}',
                '.sf-row{display:flex;gap:5px}',
                '.sf-pill{flex:1;padding:7px 0;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);font-size:11px;font-weight:600;cursor:pointer;text-align:center;transition:all .15s}',
                '.sf-pill:hover{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7)}',
                '.sf-pill.on{border-color:transparent;color:#000}',
                '.sf-pill.on-green{background:#00e87a;box-shadow:0 0 10px rgba(0,232,122,0.35)}',
                '.sf-pill.on-red{background:#f14e54;box-shadow:0 0 10px rgba(241,78,84,0.35)}',
                '.sf-pill.on-blue{background:#00b2e1;box-shadow:0 0 10px rgba(0,178,225,0.35)}',
                '.sf-pill.on-purple{background:#bf7ff5;box-shadow:0 0 10px rgba(191,127,245,0.35)}',
                '.sf-pill.on-amber{background:#f5a623;box-shadow:0 0 10px rgba(245,166,35,0.35)}',
                '.sf-pill.on-cyan{background:#00d4ff;box-shadow:0 0 10px rgba(0,212,255,0.35)}',
                '.sf-divider{height:1px;background:rgba(255,255,255,0.05);margin:2px 0}',
                '#sf-big{width:100%;padding:10px 0;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;cursor:pointer;text-align:center;letter-spacing:0.3px;transition:all .2s}',
                '#sf-big:hover{background:rgba(255,255,255,0.08)}',
                '#sf-big.active{background:linear-gradient(135deg,#00e87a,#00c264);border-color:transparent;color:#000;box-shadow:0 0 18px rgba(0,232,122,0.4)}',
                '#sf-stats-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;display:grid;grid-template-columns:1fr 1fr;gap:4px}',
                '.sf-stat{display:flex;flex-direction:column;gap:1px}',
                '.sf-stat-val{font-size:15px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}',
                '.sf-stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:rgba(255,255,255,0.25)}',
                '#sf-status{display:flex;align-items:center;gap:6px;padding:0 1px}',
                '#sf-status-dot{width:6px;height:6px;border-radius:50%;background:#444;flex-shrink:0;transition:background .2s}',
                '#sf-status-txt{font-size:11px;color:rgba(255,255,255,0.35);font-variant-numeric:tabular-nums}',
                '#sf-foot{padding:6px 14px 10px;font-size:9px;color:rgba(255,255,255,0.15);text-align:center;letter-spacing:0.3px}'
            ].join('');
            document.head.appendChild(style);

            this.rt=document.createElement('div');
            this.rt.id='sf';

            // Build HTML without any backtick conflicts
            const html = [
                '<div id="sf-hd">',
                '  <div id="sf-hd-dot"></div>',
                '  <div id="sf-hd-title">Shape Farmer</div>',
                '  <div id="sf-hd-ver">v4.7</div>',
                '</div>',
                '<div id="sf-body">',
                '  <div>',
                '    <div class="sf-label">Mode</div>',
                '    <div class="sf-row">',
                '      <button class="sf-pill on on-green" id="sf-m2">2TDM</button>',
                '      <button class="sf-pill" id="sf-m4">4TDM</button>',
                '    </div>',
                '  </div>',
                '  <div id="sf-teams">',
                '    <div class="sf-label">Team</div>',
                '    <div class="sf-row" id="sf-t2">',
                '      <button class="sf-pill" id="sf-tred">Red</button>',
                '      <button class="sf-pill" id="sf-tblue">Blue</button>',
                '    </div>',
                '    <div class="sf-row" id="sf-t4" style="display:none;flex-wrap:wrap;gap:5px">',
                '      <button class="sf-pill" id="sf-t4red" style="flex-basis:calc(50% - 3px)">Red</button>',
                '      <button class="sf-pill" id="sf-t4blue" style="flex-basis:calc(50% - 3px)">Blue</button>',
                '      <button class="sf-pill" id="sf-t4green" style="flex-basis:calc(50% - 3px)">Green</button>',
                '      <button class="sf-pill" id="sf-t4purple" style="flex-basis:calc(50% - 3px)">Purple</button>',
                '    </div>',
                '  </div>',
                '  <div class="sf-divider"></div>',
                '  <button id="sf-big">START FARMING</button>',
                '  <div class="sf-row">',
                '    <button class="sf-pill" id="sf-fire">Auto Fire</button>',
                '    <button class="sf-pill" id="sf-zoom">Zoom Out</button>',
                '    <button class="sf-pill" id="sf-ov">Overlay</button>',
                '  </div>',
                '  <div class="sf-divider"></div>',
                '  <div id="sf-stats-box">',
                '    <div class="sf-stat"><div class="sf-stat-val" id="sf-v-farmed">0</div><div class="sf-stat-lbl">Farmed</div></div>',
                '    <div class="sf-stat"><div class="sf-stat-val" id="sf-v-shapes">0</div><div class="sf-stat-lbl">Shapes</div></div>',
                '    <div class="sf-stat"><div class="sf-stat-val" id="sf-v-enemy">0</div><div class="sf-stat-lbl">Enemy Bullets</div></div>',
                '    <div class="sf-stat"><div class="sf-stat-val" id="sf-v-target">&#8212;</div><div class="sf-stat-lbl">Target</div></div>',
                '  </div>',
                '  <div id="sf-status">',
                '    <div id="sf-status-dot"></div>',
                '    <div id="sf-status-txt">Idle \u00b7 select a team</div>',
                '  </div>',
                '</div>',
                '<div id="sf-foot">` or CapsLock to hide \u00b7 Made by Mac</div>'
            ].join('\n');

            this.rt.innerHTML = html;
            document.body.appendChild(this.rt);
            this._bind();
            this._refresh();
        },

        _bind(){
            const q=id=>this.rt.querySelector(id);
            q('#sf-m2').onclick=()=>this._mode('2TDM');
            q('#sf-m4').onclick=()=>this._mode('4TDM');
            q('#sf-tred').onclick=()=>this._team('RED');
            q('#sf-tblue').onclick=()=>this._team('BLUE');
            q('#sf-t4red').onclick=()=>this._team('RED');
            q('#sf-t4blue').onclick=()=>this._team('BLUE');
            q('#sf-t4green').onclick=()=>this._team('GREEN');
            q('#sf-t4purple').onclick=()=>this._team('PURPLE');
            q('#sf-big').onclick=()=>{
                if(!selectedTeam)return;
                farmerActive=!farmerActive;
                if(!farmerActive){SI.rA();FM.st='IDLE';FM.cT=null}
                this._refresh();
            };
            q('#sf-fire').onclick=()=>{
                autoFireActive=!autoFireActive;
                setAutoFire(autoFireActive);
                this._refresh();
            };
            q('#sf-zoom').onclick=()=>{
                zoomActive=!zoomActive;
                toggleZoom(zoomActive);
                this._refresh();
            };
            q('#sf-ov').onclick=()=>{overlayEnabled=!overlayEnabled;this._refresh()};

            document.addEventListener('keydown',e=>{
                if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
                if(e.key==='`'||e.key==='CapsLock'){
                    this.vi=!this.vi;
                    this.rt.style.display=this.vi?'':'none';
                    if(SO.cv)SO.cv.style.display=this.vi?'':'none';
                    const dot=document.getElementById('mde-dot'),coord=document.getElementById('mde-coord');
                    if(dot)dot.style.display=this.vi?'':'none';
                    if(coord)coord.style.display=this.vi?'':'none';
                }
            });
        },

        _mode(m){
            gameMode=m; selectedTeam=null;
            if(farmerActive){farmerActive=false;SI.rA();FM.st='IDLE';setAutoFire(false);autoFireActive=false}
            this._refresh();
        },

        _team(t){
            selectedTeam=t;
            this._refresh();
        },

        _refresh(){
            const q=id=>this.rt.querySelector(id);
            const dot=q('#sf-hd-dot');

            q('#sf-m2').className='sf-pill'+(gameMode==='2TDM'?' on on-green':'');
            q('#sf-m4').className='sf-pill'+(gameMode==='4TDM'?' on on-green':'');

            q('#sf-t2').style.display=gameMode==='2TDM'?'flex':'none';
            q('#sf-t4').style.display=gameMode==='4TDM'?'flex':'none';

            const TC={RED:'on-red',BLUE:'on-blue',GREEN:'on-green',PURPLE:'on-purple'};

            if(gameMode==='2TDM'){
                ['RED','BLUE'].forEach(k=>{
                    const id='#sf-t'+k.toLowerCase();
                    q(id).className='sf-pill'+(selectedTeam===k?' on '+TC[k]:'');
                });
            } else {
                ['RED','BLUE','GREEN','PURPLE'].forEach(k=>{
                    const id='#sf-t4'+k.toLowerCase();
                    q(id).className='sf-pill'+(selectedTeam===k?' on '+TC[k]:'');
                });
            }

            const big=q('#sf-big');
            big.className=farmerActive?'active':'';
            big.textContent=farmerActive?'\u23f9  STOP FARMING':'\u25b6  START FARMING';

            q('#sf-fire').className='sf-pill'+(autoFireActive?' on on-amber':'');
            q('#sf-fire').textContent=autoFireActive?'Fire ON':'Auto Fire';
            q('#sf-zoom').className='sf-pill'+(zoomActive?' on on-cyan':'');
            q('#sf-zoom').textContent=zoomActive?'Zoom ON':'Zoom Out';
            q('#sf-ov').className='sf-pill'+(overlayEnabled?' on on-green':'');
            q('#sf-ov').textContent=overlayEnabled?'Overlay ON':'Overlay';

            dot.style.background=farmerActive?'#00ffaa':'rgba(255,255,255,0.2)';
            dot.style.boxShadow=farmerActive?'0 0 6px #00ffaa':'none';
        },

        uSt(shapes){
            const q=id=>this.rt&&this.rt.querySelector(id);
            if(!q('#sf-v-farmed'))return;
            q('#sf-v-farmed').textContent=totalDestroyed;
            q('#sf-v-shapes').textContent=shapes;
            q('#sf-v-enemy').textContent=CS.enemyBullets.length;
            q('#sf-v-target').textContent=FM.cT?FM.cT.t.slice(0,4):'\u2014';

            const STATE_COLOR={FARMING:'#00ffaa',RETREATING:'#ff5555',RETURNING:'#ffaa44',WANDERING:'#aaaaaa',IDLE:'rgba(255,255,255,0.25)'};
            const STATE_LABEL={FARMING:'Farming',RETREATING:'\u26a0 Retreating',RETURNING:'Returning',WANDERING:'Wandering',IDLE:'Idle'+(selectedTeam?'':' \u00b7 select a team')};
            const sdot=this.rt.querySelector('#sf-status-dot');
            const stxt=this.rt.querySelector('#sf-status-txt');
            if(sdot)sdot.style.background=STATE_COLOR[FM.st]||'#444';
            if(stxt)stxt.textContent=STATE_LABEL[FM.st]||FM.st;
        }
    };

    // ─── Main loop ────────────────────────────────────────────────────────────
    function start(){
        installZoom();
        CS.inst(); UI.init(); SO.init();
        const pe=new PE(), mo=new MO(); mo.init();
        setInterval(async()=>{if(!mo.vi)return;try{const p=await pe.gP();mo.uPP(p.X,p.Y)}catch(e){}},1000);
        const lp=()=>{
            CS.tSS(); FM.up(pe); if(farmerActive)MB.up(); SO.ren();
            frameCount++;
            if(frameCount%10===0)UI.uSt(CS.ss.length);
            CS.clr();
            requestAnimationFrame(lp);
        };
        requestAnimationFrame(lp);
    }

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
    else start();
})();
