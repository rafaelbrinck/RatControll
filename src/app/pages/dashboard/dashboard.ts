import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import QRCode from 'qrcode';
import { Auth } from '../../core/auth/auth';
import { Caixa, CaixasService } from '../../core/data/caixas';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnDestroy {
  @ViewChild('scannerVideo') scannerVideo?: ElementRef<HTMLVideoElement>;

  private readonly auth = inject(Auth);
  private readonly caixasService = inject(CaixasService);
  private readonly router = inject(Router);
  private scannerControls?: IScannerControls;

  readonly caixas = this.caixasService.caixas;
  readonly qrCodes = signal<Record<number, string>>({});
  numeroNovaCaixa: number | null = null;
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly scannerAberto = signal(false);
  readonly erro = signal('');

  constructor() {
    void this.carregarCaixas();
  }

  async carregarCaixas(): Promise<void> {
    const userId = this.auth.getUserLogado();
    if (!userId) {
      await this.auth.restaurarSessao();
    }

    const currentUserId = this.auth.getUserLogado();
    if (!currentUserId) {
      this.carregando.set(false);
      this.erro.set('Sua sessão expirou. Entre novamente para acessar as caixas.');
      return;
    }

    this.carregando.set(true);
    this.erro.set('');
    this.qrCodes.set({});

    try {
      const caixas = await this.caixasService.listar(currentUserId);
      const qrCodes: Record<number, string> = {};
      await Promise.all(caixas.map(async (caixa) => {
        const url = new URL(`/caixa/${caixa.id}`, window.location.origin).toString();
        qrCodes[caixa.id] = await QRCode.toDataURL(url, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      }));
      this.qrCodes.set(qrCodes);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar as caixas.');
    } finally {
      this.carregando.set(false);
    }
  }

  async criarCaixa(): Promise<void> {
    const userId = this.auth.getUserLogado();
    if (!userId || !this.numeroNovaCaixa || this.numeroNovaCaixa < 1) {
      this.erro.set('Informe um número de caixa válido.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');

    try {
      await this.caixasService.criar(this.numeroNovaCaixa, userId);
      this.numeroNovaCaixa = null;
      await this.carregarCaixas();
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível cadastrar a caixa.');
    } finally {
      this.salvando.set(false);
    }
  }

  async abrirLeitor(): Promise<void> {
    this.erro.set('');
    this.scannerAberto.set(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    if (!this.scannerVideo?.nativeElement) {
      this.erro.set('Não foi possível iniciar a câmera neste dispositivo.');
      this.scannerAberto.set(false);
      return;
    }

    try {
      const reader = new BrowserMultiFormatReader();
      this.scannerControls = await reader.decodeFromVideoDevice(
        undefined,
        this.scannerVideo.nativeElement,
        (result) => {
          if (result) {
            const scannedUrl = result.getText();
            this.fecharLeitor();
            void this.abrirCaixaDoQr(scannedUrl);
          }
        },
      );
    } catch {
      this.erro.set('Permita o acesso à câmera e tente novamente. A leitura exige HTTPS ou localhost.');
      this.fecharLeitor();
    }
  }

  fecharLeitor(): void {
    this.scannerControls?.stop();
    this.scannerControls = undefined;
    this.scannerAberto.set(false);
  }

  async abrirCaixaDoQr(value: string): Promise<void> {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin || !/^\/caixa\/\d+$/.test(url.pathname)) {
        this.erro.set('Este QR Code não pertence a uma caixa do RatControl.');
        return;
      }

      await this.router.navigateByUrl(url.pathname);
    } catch {
      this.erro.set('O QR Code não contém um endereço válido.');
    }
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  ngOnDestroy(): void {
    this.fecharLeitor();
  }
}