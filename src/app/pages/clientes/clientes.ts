import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import {
  Cliente,
  ClientesService,
  DadosCliente,
  ResultadoClientes,
  StatusCliente,
} from '../../core/data/clientes';
import { AppNavigation } from '../../shared/navigation/app-navigation';
import { ClienteFormComponent } from '../../shared/cliente-form/cliente-form';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppNavigation, ClienteFormComponent],
  templateUrl: './clientes.html',
})
export class ClientesPage {
  private readonly auth = inject(Auth);
  private readonly clientesService = inject(ClientesService);
  private readonly router = inject(Router);

  readonly clientes = signal<Cliente[]>([]);
  readonly busca = signal('');
  readonly buscaAplicada = signal('');
  readonly status = signal<StatusCliente>('ativos');
  readonly pagina = signal(0);
  readonly tamanhoPagina = 25;
  readonly total = signal(0);
  readonly totalPaginas = signal(1);
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly modalAberto = signal(false);
  readonly clienteEmEdicao = signal<Cliente | undefined>(undefined);
  readonly erroFormulario = signal('');
  readonly clienteParaDesativar = signal<Cliente | undefined>(undefined);

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    const userId = await this.obterUsuarioId();
    if (!userId) {
      this.erro.set('Sua sessão expirou. Entre novamente para acessar os clientes.');
      this.carregando.set(false);
      return;
    }

    this.carregando.set(true);
    this.erro.set('');
    try {
      const resultado: ResultadoClientes = await this.clientesService.listar(userId, {
        pagina: this.pagina(),
        tamanhoPagina: this.tamanhoPagina,
        busca: this.buscaAplicada(),
        status: this.status(),
      });
      this.clientes.set(resultado.clientes);
      this.total.set(resultado.total);
      this.totalPaginas.set(Math.max(1, Math.ceil(resultado.total / this.tamanhoPagina)));
    } catch (error) {
      this.clientes.set([]);
      this.total.set(0);
      this.erro.set(this.mensagemErro(error));
    } finally {
      this.carregando.set(false);
    }
  }

  pesquisar(): void {
    this.pagina.set(0);
    this.buscaAplicada.set(this.busca().trim());
    void this.carregar();
  }

  alterarStatus(status: StatusCliente): void {
    this.status.set(status);
    this.pagina.set(0);
    void this.carregar();
  }

  async alterarPagina(pagina: number): Promise<void> {
    if (pagina < 0 || pagina >= this.totalPaginas()) return;
    this.pagina.set(pagina);
    await this.carregar();
  }

  abrirNovo(): void {
    this.clienteEmEdicao.set(undefined);
    this.erroFormulario.set('');
    this.modalAberto.set(true);
  }

  abrirEdicao(cliente: Cliente): void {
    this.clienteEmEdicao.set(cliente);
    this.erroFormulario.set('');
    this.modalAberto.set(true);
  }

  fecharFormulario(): void {
    if (this.salvando()) return;
    this.modalAberto.set(false);
    this.clienteEmEdicao.set(undefined);
    this.erroFormulario.set('');
  }

  async salvarCliente(dados: DadosCliente): Promise<void> {
    const userId = await this.obterUsuarioId();
    if (!userId) {
      this.erroFormulario.set('Sua sessão expirou. Entre novamente para salvar clientes.');
      return;
    }

    this.salvando.set(true);
    this.erroFormulario.set('');
    try {
      const cliente = this.clienteEmEdicao();
      if (cliente) {
        await this.clientesService.atualizar(userId, cliente.id, dados);
        this.mensagem.set('Cadastro do cliente atualizado.');
      } else {
        await this.clientesService.criar(dados);
        this.mensagem.set('Cliente cadastrado com sucesso.');
      }
      this.modalAberto.set(false);
      this.clienteEmEdicao.set(undefined);
      await this.carregar();
    } catch (error) {
      this.erroFormulario.set(this.mensagemErro(error));
    } finally {
      this.salvando.set(false);
    }
  }

  confirmarDesativacao(): void {
    if (this.clienteParaDesativar()) void this.desativar();
  }

  async desativar(): Promise<void> {
    const cliente = this.clienteParaDesativar();
    const userId = await this.obterUsuarioId();
    if (!cliente || !userId) {
      this.erro.set('Sua sessão expirou. Entre novamente para desativar clientes.');
      this.clienteParaDesativar.set(undefined);
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    try {
      await this.clientesService.desativar(userId, cliente.id);
      this.mensagem.set(`${cliente.nome} foi desativado. O histórico de vendas foi preservado.`);
      this.clienteParaDesativar.set(undefined);
      await this.carregar();
    } catch (error) {
      this.erro.set(this.mensagemErro(error));
    } finally {
      this.salvando.set(false);
    }
  }

  async reativar(cliente: Cliente): Promise<void> {
    const userId = await this.obterUsuarioId();
    if (!userId) {
      this.erro.set('Sua sessão expirou. Entre novamente para reativar clientes.');
      return;
    }
    this.salvando.set(true);
    this.erro.set('');
    try {
      await this.clientesService.ativar(userId, cliente.id);
      this.mensagem.set(`${cliente.nome} foi reativado.`);
      await this.carregar();
    } catch (error) {
      this.erro.set(this.mensagemErro(error));
    } finally {
      this.salvando.set(false);
    }
  }

  formatarDocumento(documento: string | null): string {
    return documento || '—';
  }

  async abrirDetalhe(cliente: Cliente): Promise<void> {
    await this.router.navigate(['/clientes', cliente.id]);
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private async obterUsuarioId(): Promise<string | undefined> {
    if (!this.auth.getUserLogado()) await this.auth.restaurarSessao();
    return this.auth.getUserLogado() || undefined;
  }

  private mensagemErro(error: unknown): string {
    return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
  }
}
