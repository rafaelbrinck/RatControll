import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '../../core/auth/auth';
import { Cliente, ClientesService, DadosCliente } from '../../core/data/clientes';
import {
  adicionarItemCarrinho,
  calcularResumoCarrinho,
  FinalizarVendaError,
  FiltrosHistoricoVendas,
  ItemCarrinho,
  ItemVenda,
  atualizarQuantidadeCarrinho,
  paraCentavos,
  removerItemCarrinho,
  StatusVenda,
  validarCarrinho,
  VendaResumo,
  VendasService,
} from '../../core/data/vendas';
import { EstoqueService, ItemEstoque } from '../../core/data/estoque';
import { AppNavigation } from '../../shared/navigation/app-navigation';
import { ClienteFormComponent } from '../../shared/cliente-form/cliente-form';

type FiltroStatusVenda = StatusVenda | 'todos';
const TENTATIVA_VENDA_PENDENTE_KEY = 'ratcontroll:vendas:confirmacao-pendente';

@Component({
  selector: 'app-vendas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppNavigation, ClienteFormComponent],
  templateUrl: './vendas.html',
})
export class VendasPage {
  private readonly auth = inject(Auth);
  private readonly estoqueService = inject(EstoqueService);
  private readonly vendasService = inject(VendasService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly clientesService = inject(ClientesService);
  private readonly destroyRef = inject(DestroyRef);
  private buscaClienteTimer?: ReturnType<typeof setTimeout>;

  readonly itensEstoque = this.estoqueService.itens;
  readonly carrinho = signal<ItemCarrinho[]>([]);
  readonly busca = signal('');
  readonly filtroAnimal = signal('Todos');
  readonly carregandoEstoque = signal(true);
  readonly atualizandoEstoque = signal(false);
  readonly carregandoHistorico = signal(false);
  readonly salvando = signal(false);
  readonly exibindoHistorico = signal(false);
  readonly historicoVerificado = signal(false);
  readonly confirmacaoAberta = signal(false);
  readonly confirmacaoNovaTentativaAberta = signal(false);
  readonly resultadoIncerto = signal(false);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly erroHistorico = signal('');
  readonly descontoGeral = signal<number | null>(0);
  readonly descontoGeralCentavos = computed(() => {
    const desconto = this.descontoGeral();
    return desconto === null ? Number.NaN : paraCentavos(desconto);
  });
  readonly resumo = computed(() =>
    calcularResumoCarrinho(this.carrinho(), this.descontoGeralCentavos()),
  );
  readonly erroCarrinho = computed(() =>
    validarCarrinho(this.carrinho(), this.descontoGeralCentavos()),
  );
  readonly tiposAnimal = computed(() => [
    'Todos',
    ...new Set(
      this.itensEstoque()
        .map((item) => item.tipo_animal?.trim())
        .filter((tipo): tipo is string => !!tipo),
    ),
  ]);
  readonly itensFiltrados = computed(() => {
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    const tipo = this.filtroAnimal();
    return this.itensEstoque().filter((item) => {
      const correspondeTipo = tipo === 'Todos' || item.tipo_animal === tipo;
      const correspondeBusca = !termo
        || (item.descricao ?? '').toLocaleLowerCase('pt-BR').includes(termo)
        || (item.tipo_animal ?? '').toLocaleLowerCase('pt-BR').includes(termo);
      return correspondeTipo && correspondeBusca;
    });
  });
  readonly vendas = signal<VendaResumo[]>([]);
  readonly totalVendas = signal(0);
  readonly paginaHistorico = signal(0);
  readonly tamanhoPagina = 15;
  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalVendas() / this.tamanhoPagina)),
  );
  readonly statusHistorico = signal<FiltroStatusVenda>('todos');
  readonly dataInicial = signal('');
  readonly dataFinal = signal('');
  readonly buscaIdVenda = signal('');
  readonly buscaClienteHistorico = signal('');
  readonly vendaSelecionada = signal<VendaResumo | undefined>(undefined);
  readonly itensVendaSelecionada = signal<ItemVenda[]>([]);
  readonly carregandoDetalhes = signal(false);
  readonly buscaCliente = signal('');
  readonly clientesEncontrados = signal<Cliente[]>([]);
  readonly clienteSelecionado = signal<Cliente | undefined>(undefined);
  readonly buscandoClientes = signal(false);
  readonly erroBuscaCliente = signal('');
  readonly modalClienteAberto = signal(false);
  readonly salvandoClienteRapido = signal(false);
  readonly erroClienteRapido = signal('');

  constructor() {
    void this.carregarEstoque();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const vendaId = params.get('vendaId');
        if (vendaId) void this.abrirVendaDaRota(vendaId);
      });
  }

  async carregarEstoque(): Promise<void> {
    let userId: string | undefined;
    try {
      userId = await this.obterUsuarioId();
    } catch (error) {
      this.erro.set(this.mensagemErro(error));
      this.salvando.set(false);
      return;
    }
    if (!userId) {
      this.erro.set('Sua sessão expirou. Entre novamente para acessar o ponto de venda.');
      this.carregandoEstoque.set(false);
      return;
    }

    this.carregandoEstoque.set(true);
    this.erro.set('');
    try {
      if (globalThis.sessionStorage.getItem(TENTATIVA_VENDA_PENDENTE_KEY)) {
        this.resultadoIncerto.set(true);
        this.erro.set(
          'Há uma confirmação anterior sem resultado conhecido nesta aba. Consulte o histórico antes de iniciar outra tentativa.',
        );
      }
      const itensAtualizados = await this.estoqueService.listar(userId, true);
      const porId = new Map(itensAtualizados.map((item) => [item.id, item]));
      this.carrinho.update((itens) => itens.map((linha) => ({
        ...linha,
        quantidadeDisponivel: porId.get(linha.estoqueId)?.quantidade ?? 0,
      })));
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar o estoque.');
    } finally {
      this.carregandoEstoque.set(false);
      this.atualizandoEstoque.set(false);
    }
  }

  async atualizarEstoque(): Promise<void> {
    if (this.atualizandoEstoque()) return;
    this.atualizandoEstoque.set(true);
    await this.carregarEstoque();
  }

  alterarBuscaCliente(termo: string): void {
    this.buscaCliente.set(termo);
    this.erroBuscaCliente.set('');
    if (this.buscaClienteTimer) clearTimeout(this.buscaClienteTimer);

    const busca = termo.trim();
    if (busca.length < 2) {
      this.clientesEncontrados.set([]);
      this.buscandoClientes.set(false);
      return;
    }

    this.buscandoClientes.set(true);
    this.buscaClienteTimer = setTimeout(() => void this.pesquisarClientes(busca), 250);
  }

  private async pesquisarClientes(busca: string): Promise<void> {
    const userId = await this.obterUsuarioId();
    if (!userId) {
      this.erroBuscaCliente.set('Sua sessão expirou. Entre novamente para pesquisar clientes.');
      this.clientesEncontrados.set([]);
      this.buscandoClientes.set(false);
      return;
    }

    try {
      const clientes = await this.clientesService.buscarAtivos(userId, busca);
      if (this.buscaCliente().trim() === busca) this.clientesEncontrados.set(clientes);
    } catch (error) {
      this.clientesEncontrados.set([]);
      this.erroBuscaCliente.set(this.mensagemErro(error));
    } finally {
      if (this.buscaCliente().trim() === busca) this.buscandoClientes.set(false);
    }
  }

  selecionarCliente(cliente: Cliente): void {
    if (!cliente.ativo) {
      this.erroBuscaCliente.set('Clientes inativos não podem ser associados a novas vendas.');
      return;
    }
    this.clienteSelecionado.set(cliente);
    this.buscaCliente.set('');
    this.clientesEncontrados.set([]);
    this.erroBuscaCliente.set('');
  }

  removerCliente(): void {
    this.clienteSelecionado.set(undefined);
    this.buscaCliente.set('');
    this.clientesEncontrados.set([]);
    this.erroBuscaCliente.set('');
  }

  abrirCadastroRapido(): void {
    this.erroClienteRapido.set('');
    this.modalClienteAberto.set(true);
  }

  async salvarClienteRapido(dados: DadosCliente): Promise<void> {
    this.salvandoClienteRapido.set(true);
    this.erroClienteRapido.set('');
    try {
      const cliente = await this.clientesService.criar(dados);
      this.selecionarCliente(cliente);
      this.modalClienteAberto.set(false);
    } catch (error) {
      this.erroClienteRapido.set(this.mensagemErro(error));
    } finally {
      this.salvandoClienteRapido.set(false);
    }
  }

  fecharCadastroRapido(): void {
    if (!this.salvandoClienteRapido()) {
      this.modalClienteAberto.set(false);
      this.erroClienteRapido.set('');
    }
  }

  adicionar(item: ItemEstoque): void {
    this.erro.set('');
    if (item.quantidade < 1) {
      this.erro.set('Este item está sem estoque disponível.');
      return;
    }
    if (item.valor === null) {
      this.erro.set('Este item não possui preço cadastrado e não pode ser vendido.');
      return;
    }

    const linhaAtual = this.carrinho().find((linha) => linha.estoqueId === item.id);
    if (linhaAtual && linhaAtual.quantidade >= item.quantidade) {
      this.erro.set(`O saldo de ${item.descricao ?? 'item'} já está todo no carrinho.`);
      return;
    }
    this.carrinho.update((itens) => adicionarItemCarrinho(itens, item));
  }

  alterarQuantidade(estoqueId: number, quantidade: number | null): void {
    this.carrinho.update((itens) =>
      atualizarQuantidadeCarrinho(itens, estoqueId, quantidade ?? 0),
    );
  }

  incrementar(estoqueId: number): void {
    const item = this.carrinho().find((linha) => linha.estoqueId === estoqueId);
    if (item) this.alterarQuantidade(estoqueId, item.quantidade + 1);
  }

  decrementar(estoqueId: number): void {
    const item = this.carrinho().find((linha) => linha.estoqueId === estoqueId);
    if (item && item.quantidade > 1) this.alterarQuantidade(estoqueId, item.quantidade - 1);
  }

  alterarDescontoUnitario(estoqueId: number, valor: number | null): void {
    const descontoUnitarioCentavos = valor === null ? Number.NaN : paraCentavos(valor);
    this.carrinho.update((itens) =>
      itens.map((item) => item.estoqueId === estoqueId
        ? { ...item, descontoUnitarioCentavos }
        : item),
    );
  }

  alterarDescontoGeral(valor: number | null): void {
    this.descontoGeral.set(valor);
  }

  subtotalItem(item: ItemCarrinho): number {
    const quantidade = Number.isInteger(item.quantidade) && item.quantidade > 0 ? item.quantidade : 0;
    return (item.valorUnitarioCentavos - item.descontoUnitarioCentavos) * quantidade;
  }

  erroItem(item: ItemCarrinho): string {
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
      return 'Informe uma quantidade inteira maior que zero.';
    }
    if (item.quantidade > item.quantidadeDisponivel) {
      return `Saldo disponível: ${item.quantidadeDisponivel}.`;
    }
    if (
      !Number.isInteger(item.descontoUnitarioCentavos)
      || item.descontoUnitarioCentavos < 0
      || item.descontoUnitarioCentavos > item.valorUnitarioCentavos
    ) {
      return 'O desconto deve estar entre R$ 0,00 e o preço unitário.';
    }
    return '';
  }

  remover(estoqueId: number): void {
    this.carrinho.update((itens) => removerItemCarrinho(itens, estoqueId));
  }

  abrirConfirmacao(): void {
    this.erro.set(this.erroCarrinho() ?? '');
    if (this.erroCarrinho() || this.salvando() || this.resultadoIncerto()) return;
    this.confirmacaoAberta.set(true);
  }

  async confirmarVenda(): Promise<void> {
    if (this.salvando() || this.resultadoIncerto()) return;
    const validacao = this.erroCarrinho();
    if (validacao) {
      this.erro.set(validacao);
      this.confirmacaoAberta.set(false);
      return;
    }

    this.historicoVerificado.set(false);
    this.salvando.set(true);
    const userId = await this.obterUsuarioId();
    if (!userId) {
      this.erro.set('Sua sessão expirou. Entre novamente antes de confirmar a venda.');
      this.salvando.set(false);
      return;
    }

    const cliente = this.clienteSelecionado();
    if (cliente) {
      try {
        const clienteAtivo = await this.clientesService.obterAtivo(userId, cliente.id);
        this.clienteSelecionado.set(clienteAtivo);
      } catch (error) {
        this.erro.set(this.mensagemErro(error));
        this.salvando.set(false);
        return;
      }
    }

    try {
      globalThis.sessionStorage.setItem(TENTATIVA_VENDA_PENDENTE_KEY, '1');
    } catch (error) {
      this.erro.set(
        `Não foi possível registrar a proteção da tentativa no navegador; a venda não foi enviada. ${this.mensagemErro(error)}`,
      );
      this.salvando.set(false);
      return;
    }

    this.erro.set('');
    this.mensagem.set('');
    this.confirmacaoAberta.set(false);
    const payload = this.carrinho().map((item) => ({
      estoque_id: item.estoqueId,
      quantidade: item.quantidade,
      valor_unitario: item.valorUnitarioCentavos / 100,
      desconto_unitario: item.descontoUnitarioCentavos / 100,
    }));

    let idVenda: string;
    try {
      idVenda = await this.vendasService.finalizar(
        payload,
        this.descontoGeralCentavos(),
        cliente?.id ?? null,
      );
    } catch (error) {
      if (error instanceof FinalizarVendaError && error.resultadoIncerto) {
        this.resultadoIncerto.set(true);
        this.historicoVerificado.set(false);
        this.statusHistorico.set('todos');
        this.dataInicial.set('');
        this.dataFinal.set('');
        this.buscaIdVenda.set('');
        this.buscaClienteHistorico.set('');
        this.paginaHistorico.set(0);
        this.erro.set(
          'A conexão foi interrompida e não foi possível confirmar o resultado. O carrinho foi preservado. Consulte o histórico antes de qualquer nova tentativa; a função atual não garante idempotência.',
        );
      } else {
        try {
          globalThis.sessionStorage.removeItem(TENTATIVA_VENDA_PENDENTE_KEY);
        } catch (storageError) {
          this.erro.set(
            `A venda foi recusada pelo banco, mas não foi possível limpar a proteção de tentativa: ${this.mensagemErro(storageError)}`,
          );
          this.salvando.set(false);
          return;
        }
        this.erro.set(this.mensagemErro(error));
      }
      this.salvando.set(false);
      return;
    }

    this.carrinho.set([]);
    this.descontoGeral.set(0);
    this.resultadoIncerto.set(false);
    this.mensagem.set(`Venda #${idVenda} finalizada com sucesso.`);
    try {
      globalThis.sessionStorage.removeItem(TENTATIVA_VENDA_PENDENTE_KEY);
    } catch (error) {
      this.resultadoIncerto.set(true);
      this.erro.set(
        `Venda #${idVenda} confirmada, mas não foi possível limpar a proteção da tentativa: ${this.mensagemErro(error)}`,
      );
    }
    try {
      await this.estoqueService.listar(userId, true);
    } catch (error) {
      this.erro.set(
        `Venda #${idVenda} confirmada, mas não foi possível atualizar o estoque: ${this.mensagemErro(error)}`,
      );
    }
    try {
      await this.carregarHistorico();
    } catch (error) {
      this.erroHistorico.set(this.mensagemErro(error));
    } finally {
      this.salvando.set(false);
    }
    if (this.erroHistorico()) {
      this.erro.set(`Venda #${idVenda} confirmada, mas o histórico não pôde ser atualizado: ${this.erroHistorico()}`);
    }
  }

  abrirPermissaoNovaTentativa(): void {
    if (this.resultadoIncerto()) this.confirmacaoNovaTentativaAberta.set(true);
  }

  permitirNovaTentativa(): void {
    if (!this.historicoVerificado()) return;
    try {
      globalThis.sessionStorage.removeItem(TENTATIVA_VENDA_PENDENTE_KEY);
    } catch (error) {
      this.erro.set(`Não foi possível liberar uma nova tentativa com segurança: ${this.mensagemErro(error)}`);
      this.confirmacaoNovaTentativaAberta.set(false);
      return;
    }
    this.confirmacaoNovaTentativaAberta.set(false);
    this.resultadoIncerto.set(false);
    this.historicoVerificado.set(false);
    this.erro.set('');
  }

  limparCarrinhoVendaIdentificada(): void {
    if (!this.historicoVerificado()) return;
    try {
      globalThis.sessionStorage.removeItem(TENTATIVA_VENDA_PENDENTE_KEY);
    } catch (error) {
      this.erro.set(`Não foi possível encerrar a proteção da tentativa: ${this.mensagemErro(error)}`);
      return;
    }
    this.carrinho.set([]);
    this.descontoGeral.set(0);
    this.resultadoIncerto.set(false);
    this.erro.set('');
    this.mensagem.set('Carrinho limpo após identificar a venda no histórico.');
  }

  async abrirHistorico(): Promise<void> {
    if (this.resultadoIncerto()) {
      this.statusHistorico.set('todos');
      this.dataInicial.set('');
      this.dataFinal.set('');
      this.buscaIdVenda.set('');
      this.paginaHistorico.set(0);
    }
    this.exibindoHistorico.set(true);
    this.historicoVerificado.set(false);
    await this.carregarHistorico();
  }

  voltarAoPdv(): void {
    this.exibindoHistorico.set(false);
    this.vendaSelecionada.set(undefined);
    this.erroHistorico.set('');
  }

  async carregarHistorico(): Promise<void> {
    const userId = await this.obterUsuarioId();
    if (!userId) {
      this.erroHistorico.set('Sua sessão expirou. Entre novamente para consultar as vendas.');
      return;
    }
    if (this.dataInicial() && this.dataFinal() && this.dataInicial() > this.dataFinal()) {
      this.erroHistorico.set('A data inicial deve ser anterior ou igual à data final.');
      return;
    }

    this.carregandoHistorico.set(true);
    this.erroHistorico.set('');
    const status = this.statusHistorico();
    const filtros: FiltrosHistoricoVendas = {
      pagina: this.paginaHistorico(),
      tamanhoPagina: this.tamanhoPagina,
      status: status === 'todos' ? undefined : status,
      dataInicial: this.dataInicial() || undefined,
      dataFinal: this.dataFinal() || undefined,
      id: this.buscaIdVenda() || undefined,
      cliente: this.buscaClienteHistorico() || undefined,
    };

    try {
      const resultado = await this.vendasService.listarHistorico(userId, filtros);
      this.vendas.set(resultado.vendas);
      this.totalVendas.set(resultado.total);
      if (this.resultadoIncerto()) this.historicoVerificado.set(true);
    } catch (error) {
      this.vendas.set([]);
      this.totalVendas.set(0);
      this.historicoVerificado.set(false);
      this.erroHistorico.set(this.mensagemErro(error));
    } finally {
      this.carregandoHistorico.set(false);
    }
  }

  async alterarPagina(pagina: number): Promise<void> {
    if (pagina < 0 || pagina >= this.totalPaginas()) return;
    this.paginaHistorico.set(pagina);
    await this.carregarHistorico();
  }

  async abrirDetalhes(venda: VendaResumo): Promise<void> {
    const userId = await this.obterUsuarioId();
    if (!userId) {
      this.erroHistorico.set('Sua sessão expirou. Entre novamente para consultar esta venda.');
      return;
    }

    this.carregandoDetalhes.set(true);
    this.erroHistorico.set('');
    try {
      const detalhes = await this.vendasService.obterDetalhes(userId, venda.id);
      this.vendaSelecionada.set(detalhes.venda);
      this.itensVendaSelecionada.set(detalhes.itens);
    } catch (error) {
      this.erroHistorico.set(this.mensagemErro(error));
    } finally {
      this.carregandoDetalhes.set(false);
    }
  }

  async abrirVendaDaRota(vendaId: string): Promise<void> {
    if (!/^[1-9]\d*$/.test(vendaId)) {
      this.erroHistorico.set('O identificador da venda informado não é válido.');
      return;
    }
    this.exibindoHistorico.set(true);
    this.statusHistorico.set('todos');
    this.buscaIdVenda.set(vendaId);
    this.paginaHistorico.set(0);
    await this.carregarHistorico();
    const venda = this.vendas().find((item) => item.id === vendaId);
    if (venda) {
      await this.abrirDetalhes(venda);
    } else if (!this.erroHistorico()) {
      this.erroHistorico.set('A venda solicitada não foi encontrada no histórico disponível.');
    }
  }

  async abrirCliente(clienteId: string): Promise<void> {
    await this.router.navigate(['/clientes', clienteId]);
  }

  fecharDetalhes(): void {
    this.vendaSelecionada.set(undefined);
    this.itensVendaSelecionada.set([]);
  }

  formatarMoeda(valor: number | string): string {
    const numero = Number(valor);
    return Number.isFinite(numero)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero)
      : 'R$ 0,00';
  }

  formatarCentavos(valor: number): string {
    return this.formatarMoeda(valor / 100);
  }

  statusLabel(status: StatusVenda): string {
    return status.charAt(0).toLocaleUpperCase('pt-BR') + status.slice(1);
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
