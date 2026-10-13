/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

// Runs before every test file. jsdom has no matchMedia, no 2D canvas context and no Path2D, which
// the live chart's uPlot needs: uPlot reads the device pixel ratio's media query when its module
// loads, so any test that imports the Test screen needs the stand-ins before its first import. The
// media query never matches; the context accepts every call and measures text as empty, and the
// paths uPlot builds are only handed to it.

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    })
  }
  const context = new Proxy({} as CanvasRenderingContext2D, {
    get(target, name) {
      if (name === 'measureText') {
        return () => ({ width: 0 })
      }
      return name in target ? Reflect.get(target, name) : () => undefined
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as HTMLCanvasElement['getContext']
  if (typeof globalThis.Path2D !== 'function') {
    const ignore = () => undefined
    globalThis.Path2D = function Path2D() {
      return { moveTo: ignore, lineTo: ignore, rect: ignore, arc: ignore, closePath: ignore, bezierCurveTo: ignore, addPath: ignore }
    } as unknown as typeof Path2D
  }
}
