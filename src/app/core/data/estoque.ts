import { Injectable, signal } from '@angular/core';
import { inject } from '@angular/core';
import { supabase } from './supabase';
import { AnimaisService } from './animais';

export interface ItemEstoque {
  id: number;
  created_at: string;
  user_id: string;
  animal_id: number | null;
  quantidade: number;
  descricao: string | null;
  valor: number | null;
}

export interface NovoItemEstoque {
  animalId: number;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export interface ResultadoCadastroEstoque {
  item: ItemEstoque;
  acrescentado: boolean;
}

const COLUNAS_ESTOQUE = 'id, created_at, user_id, animal_id, quantidade, descricao, valor';

@Injectable({ providedIn: 'root' })
export class EstoqueService {
  private readonly animaisService = inject(AnimaisService);

  readonly itens = signal<ItemEstoque[]>([]);
  readonly carregando = signal(false);

  private usuarioCache: string | null = null;
  private cacheCarregado = false;
  private requisicao?: { userId: string; promise: Promise<ItemEstoque[]> };

  constructor() {
    supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT' || (this.usuarioCache && this.usuarioCache !== (sessao?.user.id ?? null))) {
        this.limpar();
      }
    });
  }

  async listar(userId: string, atualizar = false): Promise<ItemEstoque[]> {
    this.selecionarUsuario(userId);
    if (this.cacheCarregado && !atualizar) {
      return this.itens();
    }
    if (this.requisicao?.userId === userId) {
      return this.requisicao.promise;
    }

    this.carregando.set(true);
    const promise = this.buscarItens(userId);
    this.requisicao = { userId, promise };

    try {
      const itens = await promise;
      if (this.usuarioCache === userId) {
        this.itens.set(itens.map((item) => this.normalizarValor(item)));
        this.cacheCarregado = true;
      }
      return itens.map((item) => this.normalizarValor(item));
    } finally {
      if (this.requisicao?.promise === promise) {
        this.requisicao = undefined;
        this.carregando.set(false);
      }
    }
  }

  limpar(): void {
    this.usuarioCache = null;
    this.cacheCarregado = false;
    this.requisicao = undefined;
    this.itens.set([]);
    this.carregando.set(false);
  }

  async criarOuAcrescentar(userId: string, novoItem: NovoItemEstoque): Promise<ResultadoCadastroEstoque> {
    this.validarNovoItem(novoItem);
    const animais = await this.animaisService.listar(userId);
    if (!animais.some((animal) => animal.id === novoItem.animalId && animal.user_id === userId)) {
      throw new Error('Selecione um animal cadastrado na sua conta.');
    }

    const existentes = await this.listar(userId);
    const itemExistente = existentes.find((item) =>
      item.animal_id === novoItem.animalId
      && (item.descricao ?? '').trim().toLocaleLowerCase('pt-BR') === novoItem.descricao.trim().toLocaleLowerCase('pt-BR'),
    );

    if (!itemExistente) {
      const { data, error } = await supabase
        .from('Estoque')
        .insert({
          user_id: userId,
          animal_id: novoItem.animalId,
          quantidade: novoItem.quantidade,
          descricao: novoItem.descricao.trim(),
          valor: novoItem.valorUnitario,
        })
        .select(COLUNAS_ESTOQUE)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      const item = this.normalizarValor(data as ItemEstoque);
      this.atualizarCache(item);
      return { item, acrescentado: false };
    }

    const quantidadeTotal = itemExistente.quantidade + novoItem.quantidade;
    this.validarQuantidade(quantidadeTotal);
    const valorAtual = itemExistente.valor;
    const valorMedio = valorAtual === null
      ? novoItem.valorUnitario
      : (valorAtual * itemExistente.quantidade + novoItem.valorUnitario * novoItem.quantidade) / quantidadeTotal;

    return {
      item: await this.gravarAtualizacao(userId, itemExistente, {
        quantidade: quantidadeTotal,
        valor: valorMedio,
      }),
      acrescentado: true,
    };
  }

  async acrescentarQuantidade(userId: string, itemId: number, quantidade: number): Promise<ItemEstoque> {
    this.validarQuantidade(quantidade);
    await this.listar(userId);

    const item = this.itens().find((registro) => registro.id === itemId);
    if (!item) {
      throw new Error('Este item não está disponível no estoque da sua conta.');
    }

    const quantidadeTotal = item.quantidade + quantidade;
    this.validarQuantidade(quantidadeTotal);
    return this.gravarAtualizacao(userId, item, { quantidade: quantidadeTotal });
  }

  private async buscarItens(userId: string): Promise<ItemEstoque[]> {
    const { data, error } = await supabase
      .from('Estoque')
      .select(COLUNAS_ESTOQUE)
      .eq('user_id', userId)
      .order('animal_id', { ascending: true })
      .order('descricao', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as ItemEstoque[];
  }

  private async gravarAtualizacao(
    userId: string,
    item: ItemEstoque,
    alteracoes: Partial<Pick<ItemEstoque, 'quantidade' | 'valor'>>,
  ): Promise<ItemEstoque> {
    const { data, error } = await supabase
      .from('Estoque')
      .update(alteracoes)
      .eq('id', item.id)
      .eq('user_id', userId)
      .select(COLUNAS_ESTOQUE)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const itemAtualizado = this.normalizarValor(data as ItemEstoque);
    this.atualizarCache(itemAtualizado);
    return itemAtualizado;
  }

  private atualizarCache(item: ItemEstoque): void {
    this.itens.update((itens) => {
      const substituido = itens.some((atual) => atual.id === item.id);
      return substituido
        ? itens.map((atual) => atual.id === item.id ? item : atual)
        : [...itens, item].sort((a, b) =>
          (a.animal_id ?? 0) - (b.animal_id ?? 0)
          || (a.descricao ?? '').localeCompare(b.descricao ?? '', 'pt-BR'),
        );
    });
    this.cacheCarregado = true;
  }

  private normalizarValor(item: ItemEstoque): ItemEstoque {
    const valorOriginal: unknown = item.valor;
    if (valorOriginal === null || valorOriginal === undefined || valorOriginal === '') {
      return { ...item, valor: null };
    }

    const valorNumerico = Number(valorOriginal);
    return {
      ...item,
      valor: Number.isFinite(valorNumerico) ? valorNumerico : null,
    };
  }

  private validarNovoItem(item: NovoItemEstoque): void {
    if (!Number.isSafeInteger(item.animalId) || item.animalId < 1 || !item.descricao.trim()) {
      throw new Error('Selecione o animal e informe a descrição do produto.');
    }
    this.validarQuantidade(item.quantidade);
    if (!Number.isFinite(item.valorUnitario) || item.valorUnitario < 0) {
      throw new Error('Informe um valor unitário válido.');
    }
  }

  private validarQuantidade(quantidade: number): void {
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 32767) {
      throw new Error('A quantidade deve ser um número inteiro entre 1 e 32.767.');
    }
  }

  private selecionarUsuario(userId: string): void {
    if (this.usuarioCache === userId) {
      return;
    }

    this.usuarioCache = userId;
    this.cacheCarregado = false;
    this.requisicao = undefined;
    this.itens.set([]);
    this.carregando.set(false);
  }
}