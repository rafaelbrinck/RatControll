import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { EstoqueService, ItemEstoque } from '../../core/data/estoque';
import { Animal, AnimaisService } from '../../core/data/animais';
import { AppNavigation } from '../../shared/navigation/app-navigation';

interface GrupoEstoque {
  animalId: number | null;
  nomeAnimal: string;
  itens: ItemEstoque[];
}

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppNavigation],
  templateUrl: './estoque.html',
})
export class EstoquePage {
  private readonly auth = inject(Auth);
  private readonly estoqueService = inject(EstoqueService);
  private readonly animaisService = inject(AnimaisService);
  private readonly router = inject(Router);

  readonly itens = this.estoqueService.itens;
  readonly animais = this.animaisService.animais;
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly modalAberto = signal(false);
  readonly itemParaRepor = signal<ItemEstoque | undefined>(undefined);
  readonly busca = signal('');
  readonly filtroAnimal = signal<number | null>(null);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly quantidadeNova = signal<number | null>(1);
  readonly quantidadeReposicao = signal<number | null>(1);
  readonly animalIdNovo = signal<number | null>(null);
  readonly descricaoNova = signal('');
  readonly valorUnitarioNovo = signal<number | null>(null);
  readonly itensFiltrados = computed(() => {
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    const animalId = this.filtroAnimal();

    return this.itens().filter((item) => {
      const combinaTipo = animalId === null || item.animal_id === animalId;
      const nomeAnimal = this.animais().find((animal) => animal.id === item.animal_id)?.nome ?? '';
      const combinaBusca = !termo
        || nomeAnimal.toLocaleLowerCase('pt-BR').includes(termo)
        || (item.descricao ?? '').toLocaleLowerCase('pt-BR').includes(termo);
      return combinaTipo && combinaBusca;
    });
  });
  readonly gruposFiltrados = computed<GrupoEstoque[]>(() => {
    const grupos = new Map<number | null, ItemEstoque[]>();
    for (const item of this.itensFiltrados()) {
      grupos.set(item.animal_id, [...(grupos.get(item.animal_id) ?? []), item]);
    }

    return [...grupos.entries()]
      .map(([animalId, itens]) => ({
        animalId,
        nomeAnimal: this.nomeAnimal(animalId),
        itens,
      }))
      .sort((grupoA, grupoB) => grupoA.nomeAnimal.localeCompare(grupoB.nomeAnimal, 'pt-BR'));
  });

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    if (!this.auth.getUserLogado()) {
      await this.auth.restaurarSessao();
    }

    const userId = this.auth.getUserLogado();
    if (!userId) {
      this.erro.set('Sua sessão expirou. Entre novamente para acessar o estoque.');
      this.carregando.set(false);
      return;
    }

    this.carregando.set(true);
    this.erro.set('');

    try {
      await Promise.all([
        this.estoqueService.listar(userId),
        this.animaisService.listar(userId),
      ]);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar o estoque.');
    } finally {
      this.carregando.set(false);
    }
  }

  abrirCadastro(): void {
    this.itemParaRepor.set(undefined);
    this.animalIdNovo.set(this.animais()[0]?.id ?? null);
    this.descricaoNova.set('');
    this.quantidadeNova.set(1);
    this.valorUnitarioNovo.set(null);
    this.mensagem.set('');
    this.erro.set('');
    this.modalAberto.set(true);
  }

  nomeAnimal(animalId: number | null): string {
    return this.animais().find((animal) => animal.id === animalId)?.nome ?? 'Animal não vinculado';
  }

  identificarAnimal(_index: number, animal: Animal): number {
    return animal.id;
  }

  abrirReposicao(item: ItemEstoque): void {
    this.itemParaRepor.set(item);
    this.quantidadeReposicao.set(1);
    this.mensagem.set('');
    this.erro.set('');
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    if (this.salvando()) return;
    this.modalAberto.set(false);
    this.itemParaRepor.set(undefined);
  }

  async salvarNovoItem(): Promise<void> {
    const userId = this.auth.getUserLogado();
    const quantidade = this.quantidadeNova();
    const valorUnitario = this.valorUnitarioNovo();
    const animalId = this.animalIdNovo();

    if (!userId || animalId === null || quantidade === null || valorUnitario === null) {
      this.erro.set(animalId === null ? 'Selecione um animal cadastrado.' : 'Preencha os dados do produto e a quantidade.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    try {
      const resultado = await this.estoqueService.criarOuAcrescentar(userId, {
        animalId,
        descricao: this.descricaoNova(),
        quantidade,
        valorUnitario,
      });
      this.modalAberto.set(false);
      this.mensagem.set(resultado.acrescentado
        ? `Quantidade adicionada a ${this.nomeAnimal(resultado.item.animal_id)}.`
        : `${this.nomeAnimal(resultado.item.animal_id)} cadastrado no estoque.`);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível salvar o produto.');
    } finally {
      this.salvando.set(false);
    }
  }

  async salvarReposicao(): Promise<void> {
    const userId = this.auth.getUserLogado();
    const item = this.itemParaRepor();
    const quantidade = this.quantidadeReposicao();

    if (!userId || !item || quantidade === null) {
      this.erro.set('Informe uma quantidade válida para acrescentar.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    try {
      const itemAtualizado = await this.estoqueService.acrescentarQuantidade(userId, item.id, quantidade);
      this.modalAberto.set(false);
      this.itemParaRepor.set(undefined);
      this.mensagem.set(`${quantidade} unidade(s) adicionada(s) a ${this.nomeAnimal(itemAtualizado.animal_id)}.`);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível atualizar a quantidade.');
    } finally {
      this.salvando.set(false);
    }
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
