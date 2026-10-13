package mx.lealtad.core.plate

/**
 * Formatos de placa en México (L = letra, D = dígito) y el tipo de vehículo que indica cada uno.
 * Es la misma lista que server/src/plate.ts y web/src/plates.ts: si cambias una, cambia las otras.
 */
object Plate {
    private class Format(val mask: String, val groups: List<Int>, val kind: String)

    private val FORMATS = listOf(
        Format("LDDLLL", listOf(3, 3), "auto"),              // A01-ABC   automóvil particular CDMX
        Format("LLLDDDL", listOf(3, 3, 1), "auto"),          // ABC-123-D automóvil particular, otras entidades
        Format("LLLDDDD", listOf(3, 2, 2), "auto"),          // LMN-23-45 Edomex previa
        Format("DDDDLD", listOf(6), "moto"),                 // 1234A5    moto (sin guiones)
        Format("LLDDDDL", listOf(2, 4, 1), "camion"),        // AB-1234-C camión particular
        Format("DDLLLDD", listOf(2, 3, 2), "autobus"),       // 12-ABC-34 autobús particular
        Format("DLLDDDL", listOf(3, 3, 1), "remolque"),      // 1AB-234-C remolque particular
        Format("LDDDLLL", listOf(1, 3, 3), "auto_publico"),  // A-123-ABC automóvil de servicio público estatal
        Format("DLLLDDL", listOf(1, 3, 3), "camion_publico"),// 1-ABC-23D camión de servicio público estatal
        Format("LDDDDDL", listOf(1, 5, 1), "autobus_publico"),// A-12345-B autobús de servicio público estatal
        Format("LLDDDLL", listOf(2, 3, 2), "emergencia"),    // AB-123-CD ambulancias y bomberos
        Format("DDLDDD", listOf(3, 3), "ecologico"),         // 12A-345   vehículo ecológico
    )

    /** Etiqueta en español de cada tipo (las apps la traducen si hace falta). */
    val KIND_LABELS = mapOf(
        "auto" to "Auto", "moto" to "Moto", "camion" to "Camión", "autobus" to "Autobús", "remolque" to "Remolque",
        "auto_publico" to "Auto de servicio público", "camion_publico" to "Camión de servicio público",
        "autobus_publico" to "Autobús de servicio público", "emergencia" to "Ambulancia o bomberos", "ecologico" to "Vehículo ecológico",
    )

    private val TO_DIGIT = mapOf('O' to '0', 'Q' to '0', 'D' to '0', 'I' to '1', 'L' to '1', 'Z' to '2', 'S' to '5', 'B' to '8', 'G' to '6', 'A' to '4')
    private val TO_LETTER = mapOf('0' to 'O', '1' to 'I', '2' to 'Z', '5' to 'S', '8' to 'B', '6' to 'G', '4' to 'A')

    private fun compact(s: String) = s.uppercase().filter { it in 'A'..'Z' || it in '0'..'9' }

    private fun matches(c: String, mask: String) =
        c.length == mask.length && c.indices.all { i -> if (mask[i] == 'L') c[i] in 'A'..'Z' else c[i] in '0'..'9' }

    private fun formatOf(raw: String): Format? { val c = compact(raw); return FORMATS.firstOrNull { matches(c, it.mask) } }

    private fun group(c: String, groups: List<Int>): String {
        var at = 0
        return groups.map { n -> c.drop(at).take(n).also { at += n } }.joinToString("-")
    }

    /**
     * Mientras se teclea: mayúsculas y sin símbolos. Cuando ya coincide con un formato se le ponen
     * sus guiones (cada formato los lleva en lugares distintos, así que antes no se adivinan).
     */
    fun formatInput(raw: String): String {
        val c = compact(raw).take(7)
        val f = FORMATS.firstOrNull { matches(c, it.mask) } ?: return c
        return group(c, f.groups)
    }

    fun isComplete(plate: String): Boolean = formatOf(plate) != null

    /** Tipo de vehículo según el formato ("auto", "moto", "camion"…), o null si aún no está completa. */
    fun kind(plate: String): String? = formatOf(plate)?.kind

    /** Etiqueta del tipo de vehículo, o null si la placa aún no está completa. */
    fun kindLabel(plate: String): String? = kind(plate)?.let { KIND_LABELS[it] }

    /**
     * Corrige confusiones típicas del OCR según la posición y elige el formato que menos cambios
     * necesita. En una gasolinera casi todo es auto o moto: los demás formatos llevan media
     * penalización, que no alcanza para quitarle el lugar a una placa de camión leída sin errores.
     */
    private fun fix(text: String): String? {
        var best: String? = null
        var bestScore = Double.MAX_VALUE
        for (f in FORMATS) {
            if (f.mask.length != text.length) continue
            val fixed = text.indices.map { i -> if (f.mask[i] == 'L') TO_LETTER[text[i]] ?: text[i] else TO_DIGIT[text[i]] ?: text[i] }.joinToString("")
            if (!matches(fixed, f.mask)) continue
            val score = text.indices.count { text[it] != fixed[it] } + if (f.kind == "auto" || f.kind == "moto") 0.0 else 0.5
            if (score < bestScore) { best = fixed; bestScore = score }
        }
        return best
    }

    /** Palabras que aparecen impresas en las placas y no son la matrícula (MEX2026 en "EDOMEX 2026"). */
    private val NOISE = listOf("MEX", "EDO", "OME", "MEXI", "MEXIC", "GTO", "JAL", "CDMX")

    /** Una línea de texto leída por la cámara y la altura de su caja: la matrícula es el texto más grande. */
    data class Line(val text: String, val height: Int = 0)

    /**
     * Busca la placa entre las líneas leídas. Prefiere la línea que es exactamente una placa
     * (6 o 7 caracteres) y, entre varias, la de letras más altas; si no hay, revisa ventanas
     * dentro de líneas más largas. Descarta palabras impresas como "EDOMEX 2026".
     */
    fun find(lines: List<Line>): String? {
        data class Cand(val plate: String, val exact: Boolean, val height: Int)
        val found = mutableListOf<Cand>()
        for (line in lines) {
            val c = compact(line.text)
            for (size in listOf(7, 6)) {
                if (c.length < size) continue
                for (i in 0..c.length - size) {
                    val candidate = fix(c.substring(i, i + size)) ?: continue
                    val exact = c.length == size
                    if (!exact && NOISE.any { candidate.startsWith(it) }) continue
                    found += Cand(candidate, exact, line.height)
                }
            }
        }
        val best = found.sortedWith(compareByDescending<Cand> { it.exact }.thenByDescending { it.height }).firstOrNull() ?: return null
        return formatInput(best.plate)
    }

    fun find(text: String): String? = find(text.lines().map { Line(it) })
}
