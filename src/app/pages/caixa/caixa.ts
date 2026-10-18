import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { Caixa, CaixasService, HistoricoCaixa, ObservacaoCaixa } from '../../core/data/caixas';

type CategoriaEvento =
  | 'Início da reprodução'
  | 'Finalização da reprodução'
  | 'Nascimento'
  | 'Desmame'
  | 'Transferência'
  | 'Saúde'
  | 'Observação';

interface RegistroHistorico extends ObservacaoCaixa {
  categoria: CategoriaEvento;
  detalhes: string;
  quantidadeFilhotes?: number;
}

@Component({
  selector: 'app-caixa-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './caixa.html',
})
export class CaixaPage {
  private readonly auth = inject(Auth);
  private readonly caixasService = inject(CaixasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly caixa = signal<Caixa | undefined>(undefined);
  readonly historicos = signal<HistoricoCaixa[]>([]);
  readonly observacoes = signal<ObservacaoCaixa[]>([]);
  readonly filtroHistorico = signal<'Todos' | CategoriaEvento>('Todos');
  readonly categoriasEvento: readonly CategoriaEvento[] = [
    'Início da reprodução',
    'Finalização da reprodução',
    'Nascimento',
    'Desmame',
    'Transferência',
    'Saúde',
    'Observação',
  ];
  readonly registrosHistorico = computed<RegistroHistorico[]>(() =>
    this.observacoes().map((observacao) => this.formatarRegistro(observacao)),
  );
  readonly registrosFiltrados = computed(() => {
    const filtro = this.filtroHistorico();
    return filtro === 'Todos'
      ? this.registrosHistorico()
      : this.registrosHistorico().filter((registro) => registro.categoria === filtro);
  });
  readonly cicloAtivo = computed(() => this.historicos().find((historico) => historico.status));
  tipoEvento = 'Nascimento';
  quantidadeFilhotes: number | null = null;
  detalhes = '';
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly salvandoCiclo = signal(false);
  readonly erro = signal('');

  get eventoUsaQuantidade(): boolean {
    return ['Nascimento', 'Desmame', 'Transferência'].includes(this.tipoEvento);
  }

  get eventoExigeDetalhes(): boolean {
    return ['Saúde', 'Observação'].includes(this.tipoEvento);
  }

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    let userId = this.auth.getUserLogado();
    const caixaId = Number(this.route.snapshot.paramMap.get('id'));

    if (!Number.isSafeInteger(caixaId) || caixaId < 1) {
      this.erro.set('Caixa inválida ou sessão expirada.');
      this.carregando.set(false);
      return;
    }

    if (!userId) {
      await this.auth.restaurarSessao();
      userId = this.auth.getUserLogado();
    }

    if (!userId) {
      this.erro.set('Caixa inválida ou sessão expirada.');
      this.carregando.set(false);
      return;
    }

    this.carregando.set(true);
    this.erro.set('');

    try {
      const caixa = await this.caixasService.buscar(caixaId, userId);
      this.caixa.set(caixa);
      if (!caixa) {
        this.erro.set('Esta caixa não existe ou não está disponível para sua conta.');
        return;
      }

      const historicos = await this.caixasService.historicos(caixaId, userId);
      this.historicos.set(historicos);
      this.caixa.set({ ...caixa, status: historicos.some((historico) => historico.status) });
      this.observacoes.set(await this.caixasService.observacoes(historicos.map((item) => item.id)));
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar os dados da caixa.');
    } finally {
      this.carregando.set(false);
    }
  }

  async iniciarCiclo(): Promise<void> {
    const caixa = this.caixa();
    const userId = this.auth.getUserLogado();
    if (!caixa || !userId || this.cicloAtivo()) {
      return;
    }

    this.salvandoCiclo.set(true);
    this.erro.set('');

    try {
      await this.caixasService.iniciarCiclo(caixa.id, userId);
      await this.carregar();
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível iniciar o ciclo.');
    } finally {
      this.salvandoCiclo.set(false);
    }
  }

  async encerrarCiclo(): Promise<void> {
    const caixa = this.caixa();
    const userId = this.auth.getUserLogado();
    if (!caixa || !userId || !this.cicloAtivo()) {
      return;
    }

    this.salvandoCiclo.set(true);
    this.erro.set('');

    try {
      await this.caixasService.encerrarCiclo(caixa.id, userId);
      await this.carregar();
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível encerrar o ciclo.');
    } finally {
      this.salvandoCiclo.set(false);
    }
  }

  async registrar(): Promise<void> {
    const caixa = this.caixa();
    if (!caixa) {
      return;
    }

    const userId = this.auth.getUserLogado();
    if (!userId || !this.cicloAtivo()) {
      this.erro.set('Inicie um ciclo reprodutivo antes de registrar eventos nesta caixa.');
      return;
    }

    if (this.tipoEvento === 'Nascimento' && (this.quantidadeFilhotes === null || this.quantidadeFilhotes < 0)) {
      this.erro.set('Informe quantos filhotes nasceram.');
      return;
    }

    if (this.quantidadeFilhotes !== null && (!Number.isInteger(this.quantidadeFilhotes) || this.quantidadeFilhotes < 0 || this.quantidadeFilhotes > 32767)) {
      this.erro.set('A quantidade deve ser um número inteiro entre 0 e 32.767.');
      return;
    }

    if (this.eventoExigeDetalhes && !this.detalhes.trim()) {
      this.erro.set('Descreva o que aconteceu para registrar este evento.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');

    try {
      await this.caixasService.registrarEvento(
        caixa.id,
        userId,
        this.tipoEvento,
        this.eventoUsaQuantidade ? this.quantidadeFilhotes ?? undefined : undefined,
        this.detalhes,
      );
      this.tipoEvento = 'Nascimento';
      this.quantidadeFilhotes = null;
      this.detalhes = '';
      await this.carregar();
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível salvar o evento.');
    } finally {
      this.salvando.set(false);
    }
  }

  definirFiltroHistorico(filtro: 'Todos' | CategoriaEvento): void {
    this.filtroHistorico.set(filtro);
  }

  contarRegistros(filtro: 'Todos' | CategoriaEvento): number {
    if (filtro === 'Todos') {
      return this.registrosHistorico().length;
    }

    return this.registrosHistorico().filter((registro) => registro.categoria === filtro).length;
  }

  estiloCategoria(categoria: CategoriaEvento): string {
    switch (categoria) {
      case 'Início da reprodução':
        return 'border-l-teal-500 bg-teal-50 text-teal-800';
      case 'Finalização da reprodução':
        return 'border-l-slate-500 bg-slate-100 text-slate-800';
      case 'Nascimento':
        return 'border-l-rose-500 bg-rose-50 text-rose-800';
      case 'Desmame':
        return 'border-l-sky-500 bg-sky-50 text-sky-800';
      case 'Transferência':
        return 'border-l-violet-500 bg-violet-50 text-violet-800';
      case 'Saúde':
        return 'border-l-amber-500 bg-amber-50 text-amber-900';
      default:
        return 'border-l-emerald-500 bg-emerald-50 text-emerald-800';
    }
  }

  private formatarRegistro(observacao: ObservacaoCaixa): RegistroHistorico {
    const partes = observacao.observacao.split('|').map((parte) => parte.trim());
    const tipoLegado = partes[0]?.match(/^Evento:\s*(.+)$/i)?.[1]?.trim();
    const tipoRaw = observacao.tipo_evento?.trim() || tipoLegado;
    const categoria = this.categoriasEvento.find(
      (item) => item.toLocaleLowerCase('pt-BR') === tipoRaw?.toLocaleLowerCase('pt-BR'),
    ) ?? 'Observação';
    const quantidadeLegada = partes.find((parte) => /^Filhotes:\s*\d+$/i.test(parte));
    const detalhes = observacao.tipo_evento?.trim()
      ? observacao.observacao.trim()
      : partes.filter((parte) =>
        !/^Evento:/i.test(parte) && !/^Filhotes:\s*\d+$/i.test(parte),
      ).join(' | ');

    return {
      ...observacao,
      categoria,
      quantidadeFilhotes: observacao.quantidade_filhos && observacao.quantidade_filhos > 0
        ? observacao.quantidade_filhos
        : quantidadeLegada ? Number(quantidadeLegada.split(':')[1].trim()) : undefined,
      detalhes,
    };
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}