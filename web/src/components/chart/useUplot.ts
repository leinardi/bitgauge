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

/**
 * A uPlot chart in `host`: built once mounted, sized to the host's width and to `height`, fed
 * `data` as it changes, and destroyed with the component. `width` follows the host, for what is laid
 * out around the plot. The caller redraws it when its colors or its frame change.
 */
export function useUplot(
  host: Readonly<Ref<HTMLDivElement | null>>,
  options: (size: { width: number; height: number }) => uPlot.Options,
  data: () => uPlot.AlignedData,
  height: () => number,
) {
  const plot = shallowRef<uPlot | null>(null)
  const width = shallowRef(600)
  let observer: ResizeObserver | null = null
  const measure = () => host.value?.clientWidth || 600

  onMounted(() => {
    if (host.value === null) {
      return
    }
    width.value = measure()
    plot.value = new uPlot(options({ width: width.value, height: height() }), data(), host.value)
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        width.value = measure()
      })
      observer.observe(host.value)
    }
  })

  watch([width, height], ([next, tall]) => plot.value?.setSize({ width: next, height: tall }))
  watch(data, (next) => plot.value?.setData(next))

  onBeforeUnmount(() => {
    observer?.disconnect()
    plot.value?.destroy()
    plot.value = null
  })

  return { plot, width }
}
