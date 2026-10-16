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

import uPlot from 'uplot'
import { onBeforeUnmount, onMounted, type Ref, shallowRef, watch } from 'vue'

import { chartHeight } from '@/components/chart/palette'

/**
 * A uPlot chart in `host`: built once mounted, sized to the host's width, fed `data` as it
 * changes, and destroyed with the component. The caller redraws it when its colors change.
 */
export function useUplot(host: Readonly<Ref<HTMLDivElement | null>>, options: (width: number) => uPlot.Options, data: () => uPlot.AlignedData) {
  const plot = shallowRef<uPlot | null>(null)
  let observer: ResizeObserver | null = null
  const width = () => host.value?.clientWidth || 600

  onMounted(() => {
    if (host.value === null) {
      return
    }
    plot.value = new uPlot(options(width()), data(), host.value)
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        const next = width()
        plot.value?.setSize({ width: next, height: chartHeight(next) })
      })
      observer.observe(host.value)
    }
  })

  watch(data, (next) => plot.value?.setData(next))

  onBeforeUnmount(() => {
    observer?.disconnect()
    plot.value?.destroy()
    plot.value = null
  })

  return plot
}
