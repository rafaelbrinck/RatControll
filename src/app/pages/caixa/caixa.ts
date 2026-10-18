import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { Caixa, CaixasService, HistoricoCaixa, ObservacaoCaixa } from '../../core/data/caixas';

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
  readonly cicloAtivo = computed(() => this.historicos().find((historico) => historico.status));
  tipoEvento = 'Nascimento';
  quantidadeFilhotes: number | null = null;
  detalhes = '';
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly salvandoCiclo = signal(false);
  readonly erro = signal('');

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

    if (this.tipoEvento !== 'Nascimento' && !this.detalhes.trim()) {
      this.erro.set('Descreva o que aconteceu para registrar o evento.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');

    try {
      await this.caixasService.registrarEvento(
        caixa.id,
        userId,
        this.tipoEvento,
        this.tipoEvento === 'Nascimento' ? this.quantidadeFilhotes ?? undefined : undefined,
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

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}