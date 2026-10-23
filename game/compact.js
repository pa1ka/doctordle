export function compactClues(list){
 if(!list)return;
 const items=[...list.children], open=items.map((el,i)=>el.classList.contains('open')?i:-1).filter(i=>i>=0);
 const nav=document.createElement('div');nav.className='clue-tabs';nav.setAttribute('role','group');nav.setAttribute('aria-label','Выбор открытой подсказки');
 const previous=list.previousElementSibling;if(previous?.classList.contains('clue-tabs'))previous.remove();list.before(nav);
 const show=index=>{items.forEach((el,i)=>{el.hidden=i!==index;});[...nav.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));};
 items.forEach((el,i)=>{const b=document.createElement('button');b.type='button';b.textContent=String(i+1).padStart(2,'0');b.disabled=!open.includes(i);b.setAttribute('aria-label',`Подсказка ${i+1}${b.disabled?' — закрыта':''}`);b.onclick=()=>show(i);nav.append(b);});
 list.classList.add('compact-clues');list.hidden=!open.length;show(open.length?open.at(-1):-1);
}
