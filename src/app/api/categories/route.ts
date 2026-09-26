import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

async function getAuthenticatedUser(request: NextRequest) {
const sessionToken = request.cookies.get('supera_session')?.value;

if (!sessionToken) {
return null;
}

const client = await clientPromise;
const db = client.db('supera_pontos');

const session = await db.collection('sessions').findOne({
token: sessionToken,
});

if (!session) {
return null;
}

if (new Date(session.expiresAt) < new Date()) {
await db.collection('sessions').deleteOne({
_id: session._id,
});

return null;

}

const user = await db.collection('users').findOne({
_id: session.userId,
});

return user;
}

export async function GET(request: NextRequest) {
try {
const user = await getAuthenticatedUser(request);

if (!user) {
  return NextResponse.json(
    { error: 'Não autenticado.' },
    { status: 401 }
  );
}

const client = await clientPromise;
const db = client.db('supera_pontos');

const categories = await db
  .collection('categories')
  .find({ active: true })
  .sort({ name: 1 })
  .toArray();

return NextResponse.json({
  categories: categories.map((category) => ({
    id: category._id.toString(),
    name: category.name,
    description: category.description || '',
    icon: category.icon || '🧠',
    color: category.color || '#F97316',
    weeklyGoal: category.weeklyGoal || 10,
    rankable: category.rankable !== false,
    active: category.active !== false,
  })),
});

} catch (error) {
console.error('Erro ao buscar categorias:', error);

return NextResponse.json(
  { error: 'Erro interno ao buscar categorias.' },
  { status: 500 }
);

}
}

export async function POST(request: NextRequest) {
try {
const user = await getAuthenticatedUser(request);

if (!user) {
  return NextResponse.json(
    { error: 'Não autenticado.' },
    { status: 401 }
  );
}

const allowedRoles = ['super_admin', 'admin', 'educator'];

if (!allowedRoles.includes(user.role)) {
  return NextResponse.json(
    { error: 'Você não tem permissão para criar categorias.' },
    { status: 403 }
  );
}

const body = await request.json();

const name = String(body.name || '').trim();
const description = String(body.description || '').trim();
const icon = String(body.icon || '🧠').trim();
const color = String(body.color || '#F97316').trim();
const weeklyGoal = Number(body.weeklyGoal);
const rankable = body.rankable !== false;

if (!name) {
  return NextResponse.json(
    { error: 'O nome da categoria é obrigatório.' },
    { status: 400 }
  );
}

if (!Number.isFinite(weeklyGoal) || weeklyGoal <= 0) {
  return NextResponse.json(
    { error: 'A meta semanal deve ser maior que zero.' },
    { status: 400 }
  );
}

const client = await clientPromise;
const db = client.db('supera_pontos');
const categories = db.collection('categories');

const existingCategory = await categories.findOne({
  name: {
    $regex: `^${name}$`,
    $options: 'i',
  },
});

if (existingCategory) {
  return NextResponse.json(
    { error: 'Já existe uma categoria com esse nome.' },
    { status: 409 }
  );
}

const newCategory = {
  name,
  description,
  icon,
  color,
  weeklyGoal,
  rankable,
  active: true,
  createdBy: user._id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const result = await categories.insertOne(newCategory);

return NextResponse.json(
  {
    message: 'Categoria criada com sucesso.',
    category: {
      id: result.insertedId.toString(),
      name,
      description,
      icon,
      color,
      weeklyGoal,
      rankable,
      active: true,
    },
  },
  { status: 201 }
);

} catch (error) {
console.error('Erro ao criar categoria:', error);

return NextResponse.json(
  { error: 'Erro interno ao criar categoria.' },
  { status: 500 }
);

}
}
