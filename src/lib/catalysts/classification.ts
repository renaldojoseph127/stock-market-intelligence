import { CATALYST_CLASSIFICATION_VERSION, type CatalystClassificationCandidate } from "./types";

const registrationForms = new Set(["S-1","S-1/A","S-3","S-3/A","F-1","F-1/A","F-3","F-3/A","424B3","424B5"]);
const normalizeForm = (value:string) => value.trim().toUpperCase();
const hasItem = (items:string[], item:string) => items.some(value => value.replace(/^ITEM\s+/i, "").startsWith(item));

export function classifySecFiling(input:{ formType:string; items?:string[]; description?:string|null }):CatalystClassificationCandidate[] {
  const form=normalizeForm(input.formType),items=input.items ?? [],result:CatalystClassificationCandidate[]=[{
    candidateType:"sec_filing",candidateSubtype:null,confidence:1,
    reason:`An SEC ${form} filing was observed. This classification records the filing and does not assert that it caused a market move.`,
    evidence:{formType:form,items,classificationVersion:CATALYST_CLASSIFICATION_VERSION},
  }];
  if ((form==="8-K"||form==="8-K/A") && hasItem(items,"2.02")) result.push({candidateType:"earnings",candidateSubtype:"financial_results",confidence:.92,reason:"8-K Item 2.02 identifies results of operations and financial condition.",evidence:{formType:form,matchedItem:"2.02"}});
  if ((form==="8-K"||form==="8-K/A") && hasItem(items,"1.01")) result.push({candidateType:"contract",candidateSubtype:null,confidence:.82,reason:"8-K Item 1.01 identifies a material definitive agreement; the agreement's market significance is not inferred.",evidence:{formType:form,matchedItem:"1.01"}});
  if ((form==="8-K"||form==="8-K/A") && hasItem(items,"3.02")) result.push({candidateType:"offering",candidateSubtype:"equity_financing",confidence:.84,reason:"8-K Item 3.02 identifies an unregistered sale of equity securities.",evidence:{formType:form,matchedItem:"3.02"}});
  if ((form==="8-K"||form==="8-K/A") && hasItem(items,"5.02")) result.push({candidateType:"other",candidateSubtype:"management_change",confidence:.9,reason:"8-K Item 5.02 identifies director or officer departure, election, or appointment information.",evidence:{formType:form,matchedItem:"5.02"}});
  if (registrationForms.has(form)) result.push({
    candidateType:"offering",candidateSubtype:form.startsWith("S-3")||form.startsWith("F-3")?"shelf_registration":"registered_offering",confidence:form.startsWith("424B")?.78:.65,
    reason:`${form} is offering or registration-related evidence. A filing alone does not prove issuance, dilution, completion, or market impact.`,evidence:{formType:form,description:input.description??null},
  });
  return result;
}

export function primaryClassification(candidates:CatalystClassificationCandidate[]) {
  return [...candidates].sort((a,b) => b.confidence-a.confidence || Number(a.candidateType==="sec_filing")-Number(b.candidateType==="sec_filing"))[0];
}
