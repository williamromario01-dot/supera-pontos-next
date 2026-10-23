import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, hasRequiredRole, schoolExists } from "@/lib/auth";
import { getCategoryScopeFilter } from "@/lib/category-scope";
import { getSundayWeekStart, parseCivilDate, resolveOperationalSchoolId } from "@/lib/planner";

const DB_NAME = "supera_pontos";
const STAFF = ["super_admin", "admin", "educator"] as const;
const bad=(error:string,status=400)=>NextResponse.json({error},{status});

export async function GET(request:NextRequest){try{
  const result=await authenticateRequest(request);if(!result.authenticated)return bad("Não autenticado.",401);const {auth}=result;
  if(!hasRequiredRole(auth,[...STAFF,"student"]))return bad("Sem permissão.",403);
  const requested=parseCivilDate(request.nextUrl.searchParams.get("weekStart"));if(!requested)return bad("Semana inválida.");const weekStart=getSundayWeekStart(requested);
  const schoolId=auth.role==="student"?auth.schoolId:resolveOperationalSchoolId(auth,request.nextUrl.searchParams.get("schoolId"));
  if(!schoolId)return bad(auth.role==="super_admin"?"Selecione uma escola válida.":"Usuário sem escola.",403);
  const db=(await clientPromise).db(DB_NAME);const goal=await db.collection("weeklyGoals").findOne({schoolId:{$in:[schoolId,schoolId.toString()]},weekStart});
  return NextResponse.json({weekStart,goal:goal?{id:goal._id.toString(),weekStart:goal.weekStart,items:goal.items||[],updatedAt:goal.updatedAt}:null});
}catch(error){console.error("Erro ao consultar meta semanal:",error);return bad("Erro interno ao consultar meta semanal.",500)}}

export async function PUT(request:NextRequest){try{
  const result=await authenticateRequest(request);if(!result.authenticated)return bad("Não autenticado.",401);const {auth}=result;if(!hasRequiredRole(auth,STAFF))return bad("Este perfil não pode configurar metas.",403);
  const body=await request.json();const schoolId=resolveOperationalSchoolId(auth,body.schoolId);if(!schoolId)return bad(auth.role==="super_admin"?"Selecione uma escola válida.":"Usuário sem escola.",403);if(!(await schoolExists(schoolId)))return bad("Escola não encontrada.",404);
  const requested=parseCivilDate(body.weekStart);if(!requested)return bad("Semana inválida.");const weekStart=getSundayWeekStart(requested);
  if(!Array.isArray(body.items)||body.items.length>4)return bad("Informe no máximo quatro metas.");
  const parsed: Array<{ categoryId: ObjectId | null; description: string }> = body.items.map((item:unknown)=>{const row=item as Record<string,unknown>;return{categoryId:typeof row.categoryId==="string"&&ObjectId.isValid(row.categoryId)?new ObjectId(row.categoryId):null,description:typeof row.description==="string"?row.description.trim():""}});
  if(parsed.some((item)=>!item.categoryId||!item.description||item.description.length>200))return bad("Cada meta precisa de categoria válida e descrição de até 200 caracteres.");
  const unique=new Set(parsed.map((item)=>item.categoryId!.toString()));if(unique.size!==parsed.length)return bad("Não repita categorias na mesma semana.");
  const db=(await clientPromise).db(DB_NAME);const categories=parsed.length?await db.collection("categories").find({$and:[getCategoryScopeFilter(schoolId),{_id:{$in:parsed.map((item)=>item.categoryId!)}}]}).toArray():[];
  if(categories.length!==parsed.length)return bad("Uma ou mais categorias não pertencem à escola.",403);const names=new Map(categories.map((category)=>[category._id.toString(),String(category.name||"")]));
  const items=parsed.map((item)=>({categoryId:item.categoryId,categoryName:names.get(item.categoryId!.toString())||"",description:item.description}));const now=new Date();
  await db.collection("weeklyGoals").updateOne({schoolId,weekStart},{$set:{items,updatedBy:auth.userId,updatedAt:now},$setOnInsert:{schoolId,weekStart,createdBy:auth.userId,createdAt:now}},{upsert:true});
  return NextResponse.json({message:"Meta da semana salva.",goal:{weekStart,items:items.map((item)=>({...item,categoryId:item.categoryId!.toString()}))}});
}catch(error){console.error("Erro ao salvar meta semanal:",error);return bad("Erro interno ao salvar meta semanal.",500)}}
