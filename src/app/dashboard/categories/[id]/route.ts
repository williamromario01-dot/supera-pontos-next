import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';

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

function checkPermission(user: any) {
  return ['super_admin', 'admin', 'educator'].includes(user.role);
}

function getCategoryId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    if (!checkPermission(user)) {
      return NextResponse.json(
        { error: 'Você não tem permissão para editar categorias.' },
        { status: 403 }
      );
    }

    const categoryId = getCategoryId(context.params.id);

    if (!categoryId) {
      return NextResponse.json(
        { error: 'ID da categoria inválido.' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();

      if (!name) {
        return NextResponse.json(
          { error: 'O nome da categoria é obrigatório.' },
          { status: 400 }
        );
      }

      updateData.name = name;
    }

    if (body.description !== undefined) {
      updateData.description = String(body.description).trim();
    }

    if (body.icon !== undefined) {
      updateData.icon = String(body.icon).trim() || '🧠';
    }

    if (body.color !== undefined) {
      updateData.color = String(body.color).trim() || '#F97316';
    }

    if (body.weeklyGoal !== undefined) {
      const weeklyGoal = Number(body.weeklyGoal);

      if (!Number.isFinite(weeklyGoal) || weeklyGoal <= 0) {
        return NextResponse.json(
          { error: 'A meta semanal deve ser maior que zero.' },
          { status: 400 }
        );
      }

      updateData.weeklyGoal = weeklyGoal;
    }

    if (body.rankable !== undefined) {
      updateData.rankable = Boolean(body.rankable);
    }

    if (body.active !== undefined) {
      updateData.active = Boolean(body.active);
    }

    const client = await clientPromise;
    const db = client.db('supera_pontos');

    const categories = db.collection('categories');

    const existingCategory = await categories.findOne({
      _id: categoryId,
    });

    if (!existingCategory) {
      return NextResponse.json(
        { error: 'Categoria não encontrada.' },
        { status: 404 }
      );
    }

    if (updateData.name) {
      const duplicateCategory = await categories.findOne({
        _id: { $ne: categoryId },
        name: {
          $regex: `^${updateData.name}$`,
          $options: 'i',
        },
      });

      if (duplicateCategory) {
        return NextResponse.json(
          { error: 'Já existe outra categoria com esse nome.' },
          { status: 409 }
        );
      }
    }

    await categories.updateOne(
      { _id: categoryId },
      {
        $set: updateData,
      }
    );

    const updatedCategory = await categories.findOne({
      _id: categoryId,
    });

    return NextResponse.json({
      message: 'Categoria atualizada com sucesso.',
      category: {
        id: updatedCategory!._id.toString(),
        name: updatedCategory!.name,
        description: updatedCategory!.description || '',
        icon: updatedCategory!.icon || '🧠',
        color: updatedCategory!.color || '#F97316',
        weeklyGoal: updatedCategory!.weeklyGoal || 10,
        rankable: updatedCategory!.rankable !== false,
        active: updatedCategory!.active !== false,
      },
    });
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);

    return NextResponse.json(
      { error: 'Erro interno ao atualizar categoria.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    if (!checkPermission(user)) {
      return NextResponse.json(
        { error: 'Você não tem permissão para excluir categorias.' },
        { status: 403 }
      );
    }

    const categoryId = getCategoryId(context.params.id);

    if (!categoryId) {
      return NextResponse.json(
        { error: 'ID da categoria inválido.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('supera_pontos');

    const categories = db.collection('categories');

    const existingCategory = await categories.findOne({
      _id: categoryId,
    });

    if (!existingCategory) {
      return NextResponse.json(
        { error: 'Categoria não encontrada.' },
        { status: 404 }
      );
    }

    await categories.deleteOne({
      _id: categoryId,
    });

    return NextResponse.json({
      message: 'Categoria excluída com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);

    return NextResponse.json(
      { error: 'Erro interno ao excluir categoria.' },
      { status: 500 }
    );
  }
}
