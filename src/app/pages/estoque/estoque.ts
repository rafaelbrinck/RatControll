import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { EstoqueService, ItemEstoque } from '../../core/data/estoque';
import { AppNavigation } from '../../shared/navigation/app-navigation';

interface GrupoEstoque {
  tipoAnimal: string;
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
  private readonly router = inject(Router);

  readonly itens = this.estoqueService.itens;
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly modalAberto = signal(false);
  readonly itemParaRepor = signal<ItemEstoque | undefined>(undefined);
  readonly busca = signal('');
  readonly filtroAnimal = signal('Todos');
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly quantidadeNova = signal<number | null>(1);
  readonly quantidadeReposicao = signal<number | null>(1);
  readonly tipoAnimalNovo = signal('');
  readonly animalExistente = signal('');
  readonly modoTipoAnimal = signal<'existente' | 'novo'>('novo');
  readonly descricaoNova = signal('');
  readonly valorUnitarioNovo = signal<number | null>(null);
  readonly tiposAnimal = computed(() => [
    'Todos',
    ...new Set(this.itens().map((item) => item.tipo_animal).filter((tipo): tipo is string => !!tipo)),
  ]);
  readonly itensFiltrados = computed(() => {
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    const tipo = this.filtroAnimal();

    return this.itens().filter((item) => {
      const combinaTipo = tipo === 'Todos' || item.tipo_animal === tipo;
      const combinaBusca = !termo
        || (item.tipo_animal ?? '').toLocaleLowerCase('pt-BR').includes(termo)
        || (item.descricao ?? '').toLocaleLowerCase('pt-BR').includes(termo);
      return combinaTipo && combinaBusca;
    });
  });
  readonly gruposFiltrados = computed<GrupoEstoque[]>(() => {
    const grupos = new Map<string, ItemEstoque[]>();
    for (const item of this.itensFiltrados()) {
      const tipoAnimal = item.tipo_animal?.trim() || 'Animal não informado';
      grupos.set(tipoAnimal, [...(grupos.get(tipoAnimal) ?? []), item]);
    }

    return [...grupos.entries()]
      .sort(([tipoA], [tipoB]) => tipoA.localeCompare(tipoB, 'pt-BR'))
      .map(([tipoAnimal, itens]) => ({ tipoAnimal, itens }));
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
      await this.estoqueService.listar(userId);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar o estoque.');
    } finally {
      this.carregando.set(false);
    }
  }

  abrirCadastro(): void {
    this.itemParaRepor.set(undefined);
    this.tipoAnimalNovo.set('');
    const animaisExistentes = this.tiposAnimal().filter((tipo) => tipo !== 'Todos');
    this.animalExistente.set(animaisExistentes[0] ?? '');
    this.modoTipoAnimal.set(animaisExistentes.length ? 'existente' : 'novo');
    this.descricaoNova.set('');
    this.quantidadeNova.set(1);
    this.valorUnitarioNovo.set(null);
    this.mensagem.set('');
    this.erro.set('');
    this.modalAberto.set(true);
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

    if (!userId || quantidade === null || valorUnitario === null) {
      this.erro.set('Preencha os dados do produto e a quantidade.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    try {
      const resultado = await this.estoqueService.criarOuAcrescentar(userId, {
        tipoAnimal: this.modoTipoAnimal() === 'existente' ? this.animalExistente() : this.tipoAnimalNovo(),
        descricao: this.descricaoNova(),
        quantidade,
        valorUnitario,
      });
      this.modalAberto.set(false);
      this.mensagem.set(resultado.acrescentado
        ? `Quantidade adicionada ao estoque de ${resultado.item.tipo_animal ?? resultado.item.descricao ?? 'Produto'}.`
        : `${resultado.item.tipo_animal ?? resultado.item.descricao ?? 'Produto'} cadastrado no estoque.`);
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
      this.mensagem.set(`${quantidade} unidade(s) adicionada(s) a ${itemAtualizado.tipo_animal ?? itemAtualizado.descricao ?? 'Produto'}.`);
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
