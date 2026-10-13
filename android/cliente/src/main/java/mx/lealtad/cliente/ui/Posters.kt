package mx.lealtad.cliente.ui

import androidx.annotation.DrawableRes
import mx.lealtad.cliente.R
import mx.lealtad.core.data.PortalPromotion

/** Los diez carteles y su relación con las promociones (misma lógica que web/src/promoArt.ts). */
data class Poster(@DrawableRes val res: Int, val title: String, val caption: String)

val POSTERS: List<Poster> = listOf(
    Poster(R.drawable.promo_01, "Carga \$500 y recibe \$50", "Dinero virtual para la próxima visita"),
    Poster(R.drawable.promo_02, "Carga \$800 y obtén \$80 en cupón", "Escalera de consumo"),
    Poster(R.drawable.promo_03, "Tu segunda carga tiene \$50 de descuento", "Bienvenida a clientes nuevos"),
    Poster(R.drawable.promo_04, "Carga \$600 y participa por grandes premios", "Sorteos y Rasca y Gana"),
    Poster(R.drawable.promo_05, "Paga con tarjeta y recibe un beneficio adicional", "Pago digital o tarjeta"),
    Poster(R.drawable.promo_06, "Acumula puntos por cada litro", "Programa de puntos"),
    Poster(R.drawable.promo_07, "Carga 40 litros y recibe \$50 de saldo", "Por litros cargados"),
    Poster(R.drawable.promo_08, "Martes de combustible", "Promoción por horario o día"),
    Poster(R.drawable.promo_09, "Carga gasolina + compra en tienda", "Combustible más tienda"),
    Poster(R.drawable.promo_10, "Carga hoy y gana beneficios para tu próxima visita", "Regresos y metas personales"),
)

private val BY_NAME = mapOf(
    "carga \$500 y recibe \$50 para tu próxima visita" to 1,
    "carga \$800 y obtén \$80 en cupón para tu próxima visita" to 2,
    "tu segunda carga tiene \$50 de descuento" to 3,
    "carga \$600 y participa por grandes premios" to 4,
    "paga con tarjeta y recibe un beneficio adicional" to 5,
    "acumula puntos por cada litro y canjéalos por grandes beneficios" to 6,
    "carga 40 litros y recibe \$50 de saldo" to 7,
    "martes de combustible: \$50 de beneficio en tu carga" to 8,
    "carga gasolina y compra en tienda: descuento especial" to 9,
    "promoción por tiempo limitado: carga hoy y gana beneficios para tu próxima visita" to 10,
)

fun posterFor(p: PortalPromotion): Poster {
    val n = p.name.lowercase().trim()
    val t = p.type.lowercase()
    fun pick(i: Int) = POSTERS[i - 1]
    BY_NAME[n]?.let { return pick(it) }
    return when {
        listOf("meta personal", "regres", "cadena", "tercera carga", "tiempo limitado", "buen fin").any { n.contains(it) } -> pick(10)
        n.contains("escalera") || n.contains("\$800") -> pick(2)
        listOf("segunda carga", "nuevos", "bienvenida").any { n.contains(it) } -> pick(3)
        n.contains("martes") || n.contains("jueves") || t == "horario" -> pick(8)
        listOf("tarjeta", "digital", "cashback").any { n.contains(it) } || t == "cashback" -> pick(5)
        listOf("tienda", "café", "lavado", "2x1", "agua").any { n.contains(it) } -> pick(9)
        n.contains("litros") || n.contains("motos") || t == "volumen" || t == "flotillas" -> pick(7)
        n.contains("\$600") || n.contains("rasca") || n.contains("premio") || t == "sorteo" -> pick(4)
        n.contains("punto") || t == "puntos" || t == "puntos_dobles" || n.contains("extrañamos") -> pick(6)
        n.contains("\$500") -> pick(1)
        else -> pick(10)
    }
}
