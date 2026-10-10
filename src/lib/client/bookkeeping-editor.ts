import { parseAmount } from '../server/money.ts';
import { dateSchema } from '../contracts/schemas.ts';
import { invoiceLineAmount } from '../invoice-money.ts';

export function exactMoney(value:string):string|null {
 if(!value.trim())return null;const parsed=parseAmount(value.trim());if(parsed===null)throw new Error('Use a nonnegative amount with at most two decimals.');return parsed;
}
export function optionalDate(value:string):string|null {return value?dateSchema.parse(value):null;}
export function billLine(id:string,description:string,quantity:string,rate:string){
 if(!quantity.trim()||!/^\d+(?:\.\d{1,2})?$/.test(quantity))throw new Error('Use a positive quantity with at most two decimals.');
 const rateMinor=exactMoney(rate);if(rateMinor===null)throw new Error('Enter every bill line rate.');
 return {id,description,quantity:Number(quantity),rateMinor,amountMinor:invoiceLineAmount(Number(quantity),rateMinor)};
}
// Reuse the key after an uncertain response; changing any command field creates
// a new operation. No request counter, time or render participates in identity.
export class RetryKey {
 private fingerprint='';private key='';
 for(command:unknown):string{const fingerprint=JSON.stringify(command);if(fingerprint!==this.fingerprint){this.fingerprint=fingerprint;this.key=crypto.randomUUID();}return this.key;}
}
export function displayMinor(value:string):string {
 if(!/^-?\d+$/.test(value))throw new Error('Invalid exact amount');const amount=BigInt(value);const abs=amount<0n?-amount:amount;
 return `${amount<0n?'-':''}${(abs/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${(abs%100n).toString().padStart(2,'0')}`;
}
