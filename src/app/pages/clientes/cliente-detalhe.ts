import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import {
  Cliente,
  ClientesService,
  ResultadoComprasCliente,
} from '../../core/data/clientes';
import { VendaResumo } from '../../core/data/vendas';
import { AppNavigation } from '../../shared/navigation/app-navigation';

@Component({
  selector: 'app-cliente-detalhe',
  standalone: true,
  imports: [CommonModule, RouterLink, AppNavigation],
  templateUrl: './cliente-detalhe.html',
})
export class ClienteDetalhePage {
  private readonly auth = inject(Auth);
  private readonly clientesService = inject(ClientesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly cliente = signal<Cliente | undefined>(undefined);
  readonly vendas = signal<VendaResumo[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal('');
  readonly erroHistorico = signal('');
  readonly pagina = signal(0);
  readonly tamanhoPagina = 15;
  readonly totalVendas = signal(0);
  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalVendas() / this.tamanhoPagina)),
  );

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    const userId = await this.obterUsuarioId();
    const clienteId = this.route.snapshot.paramMap.get('id');
    if (!userId || !clienteId || !/^[1-9]\d*$/.test(clienteId)) {
      this.erro.set(userId ? 'O identificador do cliente não é válido.' : 'Sua sessão expirou. Entre novamente.');
      this.carregando.set(false);
      return;
    }

    this.carregando.set(true);
    this.erro.set('');
    this.erroHistorico.set('');
    try {
      const cliente = await this.clientesService.obter(userId, clienteId);
      this.cliente.set(cliente);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar o cliente.');
      this.carregando.set(false);
      return;
    }

    try {
      const compras: ResultadoComprasCliente = await this.clientesService.listarCompras(userId, clienteId, {
        pagina: this.pagina(),
        tamanhoPagina: this.tamanhoPagina,
      });
      this.vendas.set(compras.vendas);
      this.totalVendas.set(compras.total);
    } catch (error) {
      this.vendas.set([]);
      this.totalVendas.set(0);
      this.erroHistorico.set(error instanceof Error ? error.message : 'Não foi possível carregar o histórico de compras.');
    } finally {
      this.carregando.set(false);
    }
  }

  async alterarPagina(pagina: number): Promise<void> {
    if (pagina < 0 || pagina >= this.totalPaginas()) return;
    this.pagina.set(pagina);
    const userId = await this.obterUsuarioId();
    const cliente = this.cliente();
    if (!userId || !cliente) return;

    this.carregando.set(true);
    this.erro.set('');
    try {
      const resultado = await this.clientesService.listarCompras(userId, cliente.id, {
        pagina,
        tamanhoPagina: this.tamanhoPagina,
      });
      this.vendas.set(resultado.vendas);
      this.totalVendas.set(resultado.total);
    } catch (error) {
      this.vendas.set([]);
      this.erroHistorico.set(error instanceof Error ? error.message : 'Não foi possível carregar o histórico.');
    } finally {
      this.carregando.set(false);
    }
  }

  async abrirVenda(venda: VendaResumo): Promise<void> {
    await this.router.navigate(['/vendas'], { queryParams: { vendaId: venda.id } });
  }

  formatarMoeda(valor: number | string): string {
    const numero = Number(valor);
    return Number.isFinite(numero)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero)
      : 'R$ 0,00';
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private async obterUsuarioId(): Promise<string | undefined> {
    if (!this.auth.getUserLogado()) await this.auth.restaurarSessao();
    return this.auth.getUserLogado() || undefined;
  }
}
