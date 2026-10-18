import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Validacao {
  login(_token: string): void {
    // Implementação mínima para o fluxo atual.
  }

  async logout(): Promise<void> {
    // Implementação mínima para o fluxo atual.
  }
}
