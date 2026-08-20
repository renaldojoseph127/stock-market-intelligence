import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("Phase 2A.2.1 repair review migration", () => {
  it("classifies, revalidates, batches, groups, audits, preserves raw rows, and reverts", async () => {
    const db=new PGlite();
    try {
      await db.exec("create role anon;create role authenticated;create role service_role;");
      const files=(await readdir(path.join(process.cwd(),"supabase/migrations"))).filter(file=>file.endsWith(".sql")).sort();
      for(const file of files)await db.exec((await readFile(path.join(process.cwd(),"supabase/migrations",file),"utf8")).replace("create extension if not exists pgcrypto;",""));
      await db.exec(`
        insert into public.tickers(id,symbol)select('10000000-0000-0000-0000-'||lpad(value::text,12,'0'))::uuid,'R'||lpad(value::text,3,'0')from generate_series(1,7)value;
        insert into public.source_reports(id,report_date,source_filename,import_status)select('20000000-0000-0000-0000-'||lpad(value::text,12,'0'))::uuid,date'2026-01-01'+value::int, 'review-'||value||'.pdf','completed'from generate_series(1,7)value;
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,price,change_percent,trades,volume,dollar_volume,raw_values)
        select('30000000-0000-0000-0000-'||lpad(value::text,12,'0'))::uuid,('10000000-0000-0000-0000-'||lpad(value::text,12,'0'))::uuid,('20000000-0000-0000-0000-'||lpad(value::text,12,'0'))::uuid,c.id,date'2026-01-01'+value::int,
          case value when 1 then 2121 when 2 then 21947 when 3 then 2 when 4 then .11 when 5 then 100 when 6 then 1234 else 20241 end,
          case value when 4 then 22736610 else 1 end,case value when 4 then null else 100 end,case value when 4 then null else 1000 end,case value when 4 then null else 10000 end,
          case value when 4 then'{"line":"R004 +0.11% 474,317 22,736,610 $6,221,002,094"}'::jsonb else jsonb_build_object('line','R'||lpad(value::text,3,'0')||' source','price',case value when 1 then'2121'when 2 then'21947'when 3 then'2'when 5 then'100'when 6 then'1234'else'20241'end)end
        from generate_series(1,7)value cross join lateral(select id from public.market_categories order by display_order limit 1)c;
      `);
      const appearance=(number:number)=>`30000000-0000-0000-0000-${String(number).padStart(12,"0")}`;
      async function proposal(input:{appearance:number;field?:string;findingType?:string;severity?:string;original:string|null;proposed:string|null;method?:string;confidence?:number;rule:string;evidence?:Record<string,unknown>}){
        const finding=await db.query<any>(`insert into public.market_data_quality_findings(appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
          select a.id,a.ticker_id,a.report_id,a.category_id,$2,$3,$4,$5,null,$6,'2a2-v1',$7,$8::jsonb,'proposed'from public.market_mover_appearances a where a.id=$1 returning id`,[appearance(input.appearance),input.field??"price",input.findingType??"possible_missing_decimal",input.severity??"high",input.original,input.rule,input.confidence??.95,JSON.stringify(input.evidence??{rawPriceToken:input.original})]);
        const row=await db.query<any>(`insert into public.market_data_correction_proposals(finding_id,appearance_id,field_name,original_value,proposed_value,proposed_numeric_value,proposal_method,confidence_score,reason,evidence)
          values($1,$2,$3,$4,$5,$6,$7,$8,'fixture',$9::jsonb)returning*`,[finding.rows[0].id,appearance(input.appearance),input.field??"price",input.original,input.proposed,input.proposed==null?null:Number(input.proposed),input.method??"decimal_restoration",input.confidence??.95,JSON.stringify(input.evidence??{rawPriceToken:input.original})]);return row.rows[0];
      }
      const b1=await proposal({appearance:1,original:"2121",proposed:"212.1",rule:"b1"}),b2=await proposal({appearance:2,original:"21947",proposed:"219.47",rule:"b2"}),d=await proposal({appearance:3,original:"2",proposed:"200",confidence:.75,rule:"d"}),a=await proposal({appearance:6,original:"1234",proposed:"123.4",findingType:"thousands_separator_error",method:"source_line_reparse",confidence:.99,rule:"a",evidence:{rawLine:"R006 1.234"}}),stale=await proposal({appearance:7,original:"20241",proposed:"202.41",rule:"stale"});
      const conflict1=await proposal({appearance:5,original:"100",proposed:"10",rule:"conflict1"}),conflict2=await proposal({appearance:5,original:"100",proposed:"1",rule:"conflict2"});
      const rawLine="R004 +0.11% 474,317 22,736,610 $6,221,002,094",group:any[]=[];
      for(const [field,original,proposed]of[["price","0.11",null],["change_percent","22736610","0.11"],["trades",null,"474317"],["volume",null,"22736610"],["dollar_volume",null,"6221002094"]]as const)group.push(await proposal({appearance:4,field,original,proposed,method:"column_realignment",confidence:.99,rule:`column_${field}`,findingType:field==="price"?"possible_column_shift":"ocr_alignment_error",severity:field==="price"?"critical":"high",evidence:{rawLine}}));

      const tiers=await db.query<any>("select proposal_id,review_tier,batch_approval_eligible,has_conflict from public.market_data_repair_review order by proposal_id");
      expect(tiers.rows.find(row=>row.proposal_id===a.id)).toMatchObject({review_tier:"A",batch_approval_eligible:true});
      expect(tiers.rows.find(row=>row.proposal_id===b1.id)).toMatchObject({review_tier:"B",batch_approval_eligible:true});
      expect(tiers.rows.find(row=>row.proposal_id===d.id)).toMatchObject({review_tier:"D",batch_approval_eligible:false});
      expect(group.every(item=>tiers.rows.find(row=>row.proposal_id===item.id).review_tier==="C")).toBe(true);
      expect(tiers.rows.find(row=>row.proposal_id===conflict1.id)).toMatchObject({review_tier:"D",has_conflict:true,batch_approval_eligible:false});
      expect(tiers.rows.find(row=>row.proposal_id===conflict2.id)).toMatchObject({review_tier:"D",has_conflict:true,batch_approval_eligible:false});

      const item=(row:any,updatedAt=row.updated_at)=>({proposalId:row.id,updatedAt:new Date(updatedAt).toISOString()});
      const runBatch=async(action:string,items:any[],reason="reviewed",rejection:string|null=null)=>(await db.query<any>("select public.review_market_data_proposal_batch($1,$2::jsonb,'local-admin',$3,$4)result",[action,JSON.stringify(items),reason,rejection])).rows[0].result;
      await expect(runBatch("approve",Array.from({length:26},(_,index)=>({proposalId:`00000000-0000-0000-0000-${String(index).padStart(12,"0")}`,updatedAt:new Date().toISOString()})))).rejects.toThrow(/1 to 25/);
      const single=await runBatch("approve",[item(b1)]);expect(single).toMatchObject({requested:1,approved:1,skipped:0,failed:0});
      const mixed=await runBatch("approve",[item(b2),item(d),item(conflict1),item(stale,"2000-01-01T00:00:00.000Z")]);
      expect(mixed).toMatchObject({requested:4,approved:1,skipped:3,failed:0});expect(mixed.results.map((result:any)=>result.status)).toEqual(["approved","not_eligible","conflict","stale"]);
      expect((await runBatch("approve",[item(b1)])).results[0]).toMatchObject({status:"skipped",reason:"already_approved"});
      await expect(runBatch("reject",[item(d)],"",null)).rejects.toThrow(/rejection reason/);
      const rejected=await runBatch("reject",[item(d),item(b1)],"Source supports original","legitimate_extreme_move");expect(rejected).toMatchObject({requested:2,rejected:1,skipped:1,failed:0});
      expect((await runBatch("reject",[item(d)],"retry","legitimate_extreme_move")).results[0]).toMatchObject({status:"skipped",reason:"already_rejected"});
      const rejectLog=(await db.query<any>("select*from public.market_data_repair_log where proposal_id=$1 and repair_action='reject'",[d.id])).rows[0];expect(rejectLog.reason).toContain("legitimate_extreme_move");expect(rejectLog.evidence).toMatchObject({review_classifier_version:"repair-review-v1",proposal_rule_version:"2a2-v1"});

      await db.exec(`
        insert into public.tickers(symbol)select'M'||lpad(value::text,3,'0')from generate_series(1,25)value;
        insert into public.source_reports(id,report_date,source_filename,import_status)values('22000000-0000-0000-0000-000000000001','2026-02-01','max-25.pdf','completed');
        insert into public.market_mover_appearances(ticker_id,report_id,category_id,report_date,price,change_percent,trades,volume,dollar_volume,raw_values)
          select t.id,'22000000-0000-0000-0000-000000000001',c.id,'2026-02-01',2121,1,100,1000,2121000,jsonb_build_object('line',t.symbol||' 2121','price','2121')from public.tickers t cross join lateral(select id from public.market_categories order by display_order limit 1)c where t.symbol like'M%';
        insert into public.market_data_quality_findings(appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
          select a.id,a.ticker_id,a.report_id,a.category_id,'price','possible_missing_decimal','high','2121',2121,'max25_v1','2a2-v1',.95,'{"rawPriceToken":"2121"}'::jsonb,'proposed'from public.market_mover_appearances a join public.tickers t on t.id=a.ticker_id where t.symbol like'M%';
        insert into public.market_data_correction_proposals(finding_id,appearance_id,field_name,original_value,proposed_value,proposed_numeric_value,proposal_method,confidence_score,reason,evidence)
          select f.id,f.appearance_id,'price','2121','212.1',212.1,'decimal_restoration',.95,'max fixture','{"rawPriceToken":"2121"}'::jsonb from public.market_data_quality_findings f where f.rule_id='max25_v1';
      `);
      const maxRows=(await db.query<any>("select p.id,p.updated_at from public.market_data_correction_proposals p join public.market_data_quality_findings f on f.id=p.finding_id where f.rule_id='max25_v1' order by p.id")).rows;expect(maxRows).toHaveLength(25);
      expect(await runBatch("approve",maxRows.map(row=>item(row)))).toMatchObject({requested:25,approved:25,skipped:0,failed:0});

      const rawBefore=(await db.query<any>("select row_to_json(a.*)raw from public.market_mover_appearances a where id=$1",[appearance(4)])).rows[0].raw;
      const groupItems=group.map(row=>item(row));const runGroup=async(items:any[])=>(await db.query<any>("select public.review_market_data_proposal_group('approve',$1::jsonb,'local-admin','Coordinated source-line review',null)result",[JSON.stringify(items)])).rows[0].result;
      await expect(runGroup(groupItems.slice(0,4))).rejects.toThrow(/every active coordinated/);
      expect((await db.query<any>("select count(*)::int count from public.market_data_effective_values where appearance_id=$1",[appearance(4)])).rows[0].count).toBe(0);
      const grouped=await runGroup(groupItems);expect(grouped).toMatchObject({requested:5,approved:5,recomputationQueued:true});
      const effective=(await db.query<any>("select raw_price,price,raw_change_percent,change_percent,trades,volume,dollar_volume from public.market_mover_appearances_effective where id=$1",[appearance(4)])).rows[0];
      expect(effective).toMatchObject({raw_price:"0.11",price:null,raw_change_percent:"22736610",change_percent:"0.11",trades:474317,volume:22736610,dollar_volume:"6221002094"});
      expect((await db.query<any>("select row_to_json(a.*)raw from public.market_mover_appearances a where id=$1",[appearance(4)])).rows[0].raw).toEqual(rawBefore);
      for(const field of["price","change_percent","trades","volume","dollar_volume"])await db.query("select public.revert_market_data_repair($1,$2,'local-admin','Grouped repair smoke-test reversal')",[appearance(4),field]);
      const reverted=(await db.query<any>("select raw_price,price,raw_change_percent,change_percent,raw_volume,volume from public.market_mover_appearances_effective where id=$1",[appearance(4)])).rows[0];expect(reverted).toMatchObject({raw_price:"0.11",price:"0.11",raw_change_percent:"22736610",change_percent:"22736610",raw_volume:null,volume:null});
      expect((await db.query<any>("select row_to_json(a.*)raw from public.market_mover_appearances a where id=$1",[appearance(4)])).rows[0].raw).toEqual(rawBefore);
      expect((await db.query<any>("select count(*)::int count from public.market_data_repair_log where appearance_id=$1",[appearance(4)])).rows[0].count).toBe(10);
    } finally { await db.close(); }
  },30_000);
});
