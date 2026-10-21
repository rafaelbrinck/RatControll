import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase';

export interface Animal {
  id: number;
  nome: string;
  created_at: string;
  user_id: string;
}

const COLUNAS_ANIMAL = 'id, nome, created_at, user_id';

@Injectable({ providedIn: 'root' })
export class AnimaisService {
  readonly animais = signal<Animal[]>([]);
  readonly carregando = signal(false);

  private usuarioCache: string | null = null;
  private cacheCarregado = false;
  private requisicao?: { userId: string; promise: Promise<Animal[]> };

  constructor() {
    supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT' || (this.usuarioCache && this.usuarioCache !== (sessao?.user.id ?? null))) {
        this.limpar();
      }
    });
  }

  async listar(userId: string, atualizar = false): Promise<Animal[]> {
    this.selecionarUsuario(userId);
    if (this.cacheCarregado && !atualizar) {
      return this.animais();
    }
    if (this.requisicao?.userId === userId) {
      return this.requisicao.promise;
    }

    this.carregando.set(true);
    const promise = this.buscarAnimais(userId);
    this.requisicao = { userId, promise };

    try {
      const animais = await promise;
      if (this.usuarioCache === userId) {
        this.animais.set(animais);
        this.cacheCarregado = true;
      }
      return animais;
    } finally {
      if (this.requisicao?.promise === promise) {
        this.requisicao = undefined;
        this.carregando.set(false);
      }
    }
  }

  async criar(nome: string, userId: string): Promise<Animal> {
    const nomeNormalizado = nome.trim();
    this.validarNome(nomeNormalizado);
    const animais = await this.listar(userId);
    if (animais.some((animal) => this.nomesIguais(animal.nome, nomeNormalizado))) {
      throw new Error(`O animal "${nomeNormalizado}" já está cadastrado.`);
    }

    const { data, error } = await supabase
      .from('Animais')
      .insert({ nome: nomeNormalizado, user_id: userId })
      .select(COLUNAS_ANIMAL)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const animal = data as Animal;
    this.salvarNoCache(animal);
    return animal;
  }

  async renomear(animalId: number, nome: string, userId: string): Promise<Animal> {
    const nomeNormalizado = nome.trim();
    this.validarNome(nomeNormalizado);
    const animais = await this.listar(userId);
    if (animais.some((animal) => animal.id !== animalId && this.nomesIguais(animal.nome, nomeNormalizado))) {
      throw new Error(`O animal "${nomeNormalizado}" já está cadastrado.`);
    }

    const { data, error } = await supabase
      .from('Animais')
      .update({ nome: nomeNormalizado })
      .eq('id', animalId)
      .eq('user_id', userId)
      .select(COLUNAS_ANIMAL)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const animal = data as Animal;
    this.salvarNoCache(animal);
    return animal;
  }

  limpar(): void {
    this.usuarioCache = null;
    this.cacheCarregado = false;
    this.requisicao = undefined;
    this.animais.set([]);
    this.carregando.set(false);
  }

  private async buscarAnimais(userId: string): Promise<Animal[]> {
    const { data, error } = await supabase
      .from('Animais')
      .select(COLUNAS_ANIMAL)
      .eq('user_id', userId)
      .order('nome', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as Animal[];
  }

  private salvarNoCache(animal: Animal): void {
    this.animais.update((animais) =>
      [...animais.filter((atual) => atual.id !== animal.id), animal]
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    );
    this.cacheCarregado = true;
  }

  private selecionarUsuario(userId: string): void {
    if (this.usuarioCache === userId) return;
    this.usuarioCache = userId;
    this.cacheCarregado = false;
    this.requisicao = undefined;
    this.animais.set([]);
    this.carregando.set(false);
  }

  private nomesIguais(a: string, b: string): boolean {
    return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
  }

  private validarNome(nome: string): void {
    if (!nome) {
      throw new Error('Informe o nome do animal.');
    }
  }
}
