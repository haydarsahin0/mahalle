// Supabase expects phone numbers in E.164 form. The UI is Turkish, so accept the
// common local spellings and always send one unambiguous +90 mobile number.
export function normalizePhone(value){
 let digits=String(value||'').replace(/\D/g,'');
 if(digits.startsWith('0090'))digits=digits.slice(2);
 if(digits.startsWith('90'))digits=digits.slice(2);
 if(digits.startsWith('0'))digits=digits.slice(1);
 if(!/^5\d{9}$/.test(digits))throw Error('Geçerli bir Türkiye cep telefonu numarası gir.');
 return `+90${digits}`;
}

export function maskedPhone(value){
 const phone=normalizePhone(value);
 return `${phone.slice(0,3)} ${phone.slice(3,6)} *** ** ${phone.slice(-2)}`;
}
