export function normalizeTicker(input:string){const value=input.trim().toUpperCase();return /^[A-Z][A-Z0-9]{0,9}(?:[.\-][A-Z0-9]{1,3})?$/.test(value)?value:null;}
