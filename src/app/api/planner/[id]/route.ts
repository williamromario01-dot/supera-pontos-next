import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { parseCivilDate, resolveOperationalSchoolId, TIME_PATTERN } from "@/lib/planner";
const DB_NAME = "supera_pontos";
type Context = { params: Promise<{ id: string }> };
const bad=(error:string,status=400)=>NextResponse.json({error},{status});
async function contextFor(request: NextRequest, context: Context) {
  const result=await authenticateRequest(request); if(!result.authenticated)return {response:bad("Não autenticado.",401)};
  const id=(await context.params).id; if(!ObjectId.isValid(id))return {response:bad("Evento inválido.")};
  const auth=result.auth; const schoolId=auth.role==="student"?auth.schoolId:resolveOperationalSchoolId(auth,request.nextUrl.searchParams.get("schoolId"));
  if(!schoolId)return {response:bad(auth.role==="super_admin"?"Selecione uma escola válida.":"Usuário sem escola.",403)};
  const db=(await clientPromise).db(DB_NAME); const event=await db.collection("plannerEvents").findOne({_id:new ObjectId(id),schoolId:{$in:[schoolId,schoolId.toString()]}});
  if(!event)return {response:bad("Evento não encontrado.",404)};
  const ownsPersonal=event.type==="personal"&&auth.role==="student"&&String(event.studentId)===auth.userId.toString();
  const managesInstitutional=event.type==="institutional"&&(auth.role==="admin"||auth.role==="educator"||auth.role==="super_admin");
  if(!ownsPersonal&&!managesInstitutional)return {response:bad("Você não pode alterar este evento.",403)};
  return {auth,db,event,eventId:new ObjectId(id),schoolId};
}
export async function PATCH(request:NextRequest,ctx:Context){try{const value=await contextFor(request,ctx);if("response"in value)return value.response;const {db,eventId,event,schoolId}=value;const body=await request.json();const set:Record<string,unknown>={updatedAt:new Date()};
  if(body.completed!==undefined){if(event.type!=="personal")return bad("Evento institucional não pode ser concluído.",403);set.completed=body.completed===true;}
  if(body.title!==undefined){const title=String(body.title).trim();if(!title||title.length>120)return bad("Título inválido.");set.title=title;}
  if(body.description!==undefined){const description=String(body.description).trim();if(description.length>1000)return bad("Descrição inválida.");set.description=description;}
  if(body.startDate!==undefined){const date=parseCivilDate(body.startDate);if(!date)return bad("Data inválida.");set.startDate=date;}
  if(body.startTime!==undefined){if(!TIME_PATTERN.test(String(body.startTime)))return bad("Horário inválido.");set.startTime=body.startTime;}
  if(body.endTime!==undefined){if(body.endTime!==null&&!TIME_PATTERN.test(String(body.endTime)))return bad("Horário final inválido.");set.endTime=body.endTime||null;}
  if(event.type==="institutional"){
    if(body.recurrence!==undefined){if(body.recurrence!=="once"&&body.recurrence!=="weekly")return bad("Recorrência inválida.");set.recurrence=body.recurrence;}
    if(body.recurrenceEnd!==undefined){const recurrenceEnd=body.recurrenceEnd?parseCivilDate(body.recurrenceEnd):null;if(body.recurrenceEnd&&!recurrenceEnd)return bad("Fim da recorrência inválido.");set.recurrenceEnd=recurrenceEnd;}
    if(body.audience!==undefined){if(body.audience!=="school"&&body.audience!=="class")return bad("Público inválido.");set.audience=body.audience;if(body.audience==="school"){set.classId=null;set.className=null;}else{if(!ObjectId.isValid(String(body.classId||"")))return bad("Turma inválida.");const classId=new ObjectId(String(body.classId));const classDoc=await db.collection("classes").findOne({_id:classId,schoolId:{$in:[schoolId,schoolId.toString()]}});if(!classDoc)return bad("Turma não pertence à escola.",403);set.classId=classId;set.className=String(classDoc.name||"");}}
  }  await db.collection("plannerEvents").updateOne({_id:eventId},{$set:set});return NextResponse.json({message:"Evento atualizado."});
}catch(error){console.error("Erro ao atualizar evento:",error);return bad("Erro interno ao atualizar evento.",500)}}
export async function DELETE(request:NextRequest,ctx:Context){try{const value=await contextFor(request,ctx);if("response"in value)return value.response;await value.db.collection("plannerEvents").deleteOne({_id:value.eventId});return NextResponse.json({message:"Evento excluído."});}catch(error){console.error("Erro ao excluir evento:",error);return bad("Erro interno ao excluir evento.",500)}}
