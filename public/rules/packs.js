// Jeton packs. One jeton is one Turkish lira of game credit; prices are in kuruş so no
// floating point ever touches money. Jetons buy land inside the game and are never redeemable.
export const PACKS=[
 {id:'baslangic',name:'Başlangıç',jetons:100,kurus:10000,note:'Bir tarla köşesi için'},
 {id:'avantajli',name:'Avantajlı',jetons:500,kurus:40000,note:'İlk arsan için',best:true},
 {id:'yatirimci',name:'Yatırımcı',jetons:1200,kurus:99900,note:'Portföy kurmak için'}];
export const packById=id=>PACKS.find(p=>p.id===id)||null;
export const lira=kurus=>kurus/100;
// Extra jetons over the plain one-lira-one-jeton rate, as a percentage.
export const bonus=pack=>Math.round((pack.jetons/(pack.kurus/100)-1)*100);
