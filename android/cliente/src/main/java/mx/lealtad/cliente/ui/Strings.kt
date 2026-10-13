package mx.lealtad.cliente.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import java.util.Locale
import mx.lealtad.core.data.litros
import mx.lealtad.core.data.pesos

/**
 * Capa mínima de idiomas. El español es la clave: `tr("Hola")` devuelve la misma cadena en ES y
 * busca su traducción en [EN] cuando el idioma es inglés (si falta, vuelve al español).
 * Los marcadores `{nombre}` se sustituyen después de traducir.
 */
enum class Lang(val code: String) {
    ES("es"), EN("en");

    val locale: Locale get() = if (this == EN) Locale.US else Locale("es", "MX")

    companion object {
        fun of(code: String?): Lang = if (code == "en") EN else ES
    }
}

val LocalLang = compositionLocalOf { Lang.ES }

/** Versión sin Compose, para usar fuera de composables (lambdas de dibujo, corrutinas). */
fun translate(lang: Lang, es: String, vararg args: Pair<String, Any>): String {
    var s = if (lang == Lang.EN) (EN[es] ?: es) else es
    for ((k, v) in args) s = s.replace("{$k}", v.toString())
    return s
}

@Composable
fun tr(es: String, vararg args: Pair<String, Any>): String = translate(LocalLang.current, es, *args)

/** Importes y litros con el formato del idioma activo. */
@Composable
fun money(cents: Long): String = pesos(cents, LocalLang.current.locale)

@Composable
fun money(cents: Int): String = money(cents.toLong())

@Composable
fun liters(ml: Int): String = litros(ml, LocalLang.current.locale)

/** Fecha corta a partir de ISO: dd/MM en español, MM/dd en inglés. */
@Composable
fun shortDate(iso: String?): String {
    val s = iso?.takeIf { it.length >= 10 } ?: return "—"
    val day = s.substring(8, 10)
    val month = s.substring(5, 7)
    return if (LocalLang.current == Lang.EN) "$month/$day" else "$day/$month"
}
