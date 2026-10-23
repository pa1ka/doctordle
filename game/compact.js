export function compactClues(list){
 if(!list)return;
 const items=[...list.children], open=items.map((el,i)=>el.classList.contains('open')?i:-1).filter(i=>i>=0);
 const previous=list.previousElementSibling;if(previous?.classList.contains('clue-tabs'))previous.remove();
 const nav=document.createElement('div');nav.className='clue-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Этапы обследования');list.before(nav);
 const show=index=>{items.forEach((el,i)=>{el.hidden=i!==index;});[...nav.children].forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});list.scrollTop=0;};
 items.forEach((el,i)=>{const b=document.createElement('button');b.type='button';b.textContent=String(i+1).padStart(2,'0');b.disabled=!open.includes(i);b.id='clue-tab-'+i;b.setAttribute('role','tab');b.setAttribute('aria-controls','clue-panel-'+i);b.setAttribute('aria-label',`Подсказка ${i+1}${b.disabled?' — закрыта':''}`);el.id='clue-panel-'+i;el.setAttribute('role','tabpanel');el.setAttribute('aria-labelledby',b.id);b.onclick=()=>show(i);b.onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();let next=e.key==='Home'?open[0]:e.key==='End'?open.at(-1):open[(open.indexOf(i)+(e.key==='ArrowRight'?1:-1)+open.length)%open.length];show(next);nav.children[next].focus();}};nav.append(b);});
 list.classList.add('compact-clues');list.hidden=false;show(open.length?open.at(-1):-1);
 if(!open.length){const empty=document.createElement('li');empty.className='clue-placeholder';empty.textContent='Начните с вашего варианта ответа';list.append(empty);}
}
