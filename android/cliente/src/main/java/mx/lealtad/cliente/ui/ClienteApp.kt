package mx.lealtad.cliente.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mx.lealtad.cliente.R
import mx.lealtad.core.data.ApiException
import mx.lealtad.core.data.Coupon
import mx.lealtad.core.data.Entry
import mx.lealtad.core.data.LealtadApi
import mx.lealtad.core.data.PortalMe
import mx.lealtad.core.data.PortalMembership
import mx.lealtad.core.data.PortalPromotion
import mx.lealtad.cliente.data.Prefs
import mx.lealtad.core.data.WalletMovement
import mx.lealtad.cliente.ui.theme.Turq

// Las etiquetas son claves en español; se pasan por tr() al mostrarse.
private enum class Tab(val label: String, val picto: Int) { Resumen("Resumen", Pictos.pump), Promos("Promos", Pictos.tag), Dinero("Dinero", Pictos.coins), Cargas("Cargas", Pictos.carFuel) }

private val KIND = mapOf("earn" to "Ganaste", "redeem" to "Usaste puntos", "reverse" to "Venta anulada", "adjust" to "Devolución", "expire" to "Vencieron", "release" to "Reserva liberada")
private val WALLET_KIND = mapOf("earn" to "Recibiste", "spend" to "Usaste", "expire" to "Venció", "cancel" to "Cancelado")
private val WALLET_STATUS = mapOf("active" to "disponible", "partial" to "queda una parte", "used" to "ya usado", "expired" to "vencido", "cancelled" to "cancelado", "done" to "aplicado")
private val COUPON_STATUS = mapOf("issued" to "vigente", "redeemed" to "ya usado", "expired" to "vencido", "cancelled" to "cancelado")

internal const val NO_CONNECTION = "Sin conexión. Revisa la red o la dirección del servidor."

private fun formatPhone(d: String): String = when { d.length <= 2 -> d; d.length <= 6 -> "${d.take(2)} ${d.drop(2)}"; else -> "${d.take(2)} ${d.substring(2, 6)} ${d.drop(6)}" }

@Composable
fun ClienteApp() {
    val context = LocalContext.current
    val prefs = remember { Prefs(context) }
    var lang by remember { mutableStateOf(Lang.of(prefs.lang)) }
    CompositionLocalProvider(LocalLang provides lang) {
        Portal(prefs, lang, onLang = { lang = it; prefs.lang = it.code })
    }
}

@Composable
private fun Portal(prefs: Prefs, lang: Lang, onLang: (Lang) -> Unit) {
    var baseUrl by remember { mutableStateOf(prefs.baseUrl) }
    val api = remember(baseUrl) { LealtadApi(baseUrl) }
    var token by remember { mutableStateOf(prefs.portalToken) }
    var me by remember { mutableStateOf<PortalMe?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun load(t: String) {
        try { me = api.portalMe(t); error = null } catch (e: ApiException) {
            if (e.status == 401) { token = null; prefs.portalToken = null; me = null } else error = if (e.code == "NETWORK") NO_CONNECTION else e.message
        } catch (e: Exception) { error = NO_CONNECTION }
    }
    LaunchedEffect(token, baseUrl) { token?.let { load(it) } }

    val t = token
    if (t == null) {
        PhoneLogin(api, prefs, baseUrl, lang, onLang, onBaseUrl = { baseUrl = it; prefs.baseUrl = it }, onLogged = { token = it; prefs.portalToken = it })
        return
    }
    val data = me
    var tab by rememberSaveable { mutableStateOf(Tab.Resumen.name) }
    Scaffold(
        containerColor = Turq.Bg,
        bottomBar = {
            NavigationBar(containerColor = Turq.Surface, tonalElevation = 0.dp) {
                Tab.entries.forEach { tb ->
                    NavigationBarItem(
                        selected = tab == tb.name, onClick = { tab = tb.name },
                        icon = { Picto(tb.picto, size = 24.dp, color = if (tab == tb.name) Turq.AccentStrong else Turq.Muted) },
                        label = { Text(tr(tb.label), fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                        colors = NavigationBarItemDefaults.colors(indicatorColor = Turq.AccentSoft, selectedTextColor = Turq.AccentStrong, unselectedTextColor = Turq.Muted),
                    )
                }
            }
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Picto(Pictos.userStar, size = 20.dp, color = Turq.Muted)
                Text("  ${data?.phone ?: prefs.phone}", color = Turq.Muted, style = MaterialTheme.typography.bodyMedium)
                Spacer1()
                LangToggle(lang, onLang)
                TextButton(onClick = { scope.launch { load(t) } }) { Text(tr("Actualizar"), color = Turq.AccentStrong, fontWeight = FontWeight.Bold) }
                TextButton(onClick = { token = null; prefs.portalToken = null; me = null }) { Text(tr("Salir"), color = Turq.AccentStrong, fontWeight = FontWeight.Bold) }
            }
            error?.let { Notice(tr(it)) }
            if (data == null) { Card { Text(tr("Cargando tus puntos…"), color = Turq.Muted) }; return@Column }
            if (data.memberships.isEmpty()) Card { Text(tr("Todavía no participas"), style = MaterialTheme.typography.titleMedium); Text(tr("Pide al despachador que te registre con este celular en tu próxima carga."), color = Turq.Muted) }
            data.memberships.forEach { m ->
                Hero(m)
                when (Tab.valueOf(tab)) {
                    Tab.Resumen -> Resumen(m, api, t, onPromos = { tab = Tab.Promos.name }, onReload = { scope.launch { load(t) } }, onConsent = { g -> scope.launch { runCatching { api.setConsent(t, m.membershipId, g) }; load(t) } })
                    Tab.Promos -> Promos(m, prefs)
                    Tab.Dinero -> Dinero(m)
                    Tab.Cargas -> Cargas(m)
                }
            }
            if (Tab.valueOf(tab) == Tab.Resumen) VehiclesCard(data.vehicles, api, t) { scope.launch { load(t) } }
        }
    }
}

@Composable
private fun PhoneLogin(api: LealtadApi, prefs: Prefs, baseUrl: String, lang: Lang, onLang: (Lang) -> Unit, onBaseUrl: (String) -> Unit, onLogged: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var phone by rememberSaveable { mutableStateOf(prefs.phone) }
    var challenge by remember { mutableStateOf<Pair<String, String?>?>(null) }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showServer by remember { mutableStateOf(false) }
    fun run(block: suspend () -> Unit) {
        busy = true; error = null
        scope.launch {
            try { block() } catch (e: ApiException) { error = if (e.code == "NETWORK") NO_CONNECTION else e.message } catch (e: Exception) { error = e.message ?: "Sin conexión" } finally { busy = false }
        }
    }

    Column(Modifier.fillMaxSize().background(Turq.Bg).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { LangToggle(lang, onLang) }
        Image(painterResource(R.drawable.poster_carga_500), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(1.6f).clip(RoundedCornerShape(22.dp)))
        Text(tr("Tus puntos y premios"), style = MaterialTheme.typography.headlineMedium, color = Turq.Ink)
        Text(if (challenge == null) tr("Escribe tu celular y te mandamos un código por WhatsApp. No necesitas descargar nada más.") else tr("Escribe el código de 4 dígitos que te llegó."), color = Turq.Muted, style = MaterialTheme.typography.bodyLarge)
        Card(accent = true) {
            val ch = challenge
            if (ch == null) {
                OutlinedTextField(
                    value = formatPhone(phone), onValueChange = { phone = it.filter(Char::isDigit).take(10) }, label = { Text(tr("Tu celular")) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(),
                    textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Turq.Accent, unfocusedBorderColor = Turq.LineStrong),
                )
                PrimaryButton(if (busy) tr("Enviando…") else tr("Enviarme un código"), enabled = !busy && phone.length == 10) { run { val r = api.portalStart(phone); prefs.phone = phone; challenge = r.challengeId to r.devCode } }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Demo:"), color = Turq.Muted, fontSize = 13.sp)
                    TextButton(onClick = { phone = "5544334317" }) { Text("55 4433 4317", color = Turq.AccentStrong, fontWeight = FontWeight.Bold) }
                    TextButton(onClick = { phone = "5611122233" }) { Text("56 1112 2233", color = Turq.AccentStrong, fontWeight = FontWeight.Bold) }
                }
            } else {
                OutlinedTextField(
                    value = code, onValueChange = { code = it.filter(Char::isDigit).take(4) }, label = { Text(tr("Código")) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth(),
                    textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center, letterSpacing = 8.sp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Turq.Accent, unfocusedBorderColor = Turq.LineStrong),
                )
                ch.second?.let { Notice(tr("Demo: tu código es {code}", "code" to it), Turq.Ink2, Turq.Surface2) }
                PrimaryButton(if (busy) tr("Entrando…") else tr("Entrar"), enabled = !busy && code.length == 4) { run { val r = api.portalConfirm(ch.first, code); challenge = null; code = ""; onLogged(r.token) } }
                TextButton(onClick = { challenge = null }) { Text(tr("Cambiar celular"), color = Turq.AccentStrong) }
            }
            error?.let { Notice(tr(it)) }
        }
        TextButton(onClick = { showServer = !showServer }) { Text(if (showServer) tr("Ocultar servidor") else tr("Servidor: {url}", "url" to baseUrl), color = Turq.Muted, fontSize = 12.sp) }
        if (showServer) {
            var url by remember { mutableStateOf(baseUrl) }
            OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text(tr("Dirección del servidor")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            TextButton(onClick = { onBaseUrl(url.trim().trimEnd('/')); showServer = false }) { Text(tr("Guardar"), color = Turq.AccentStrong, fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun Hero(m: PortalMembership) {
    val minPts = m.redemption.minPoints
    val ringMax = if (m.points >= minPts) m.points else minPts
    val left = m.stampsForReward - m.stamps
    Card(accent = true) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("Hola, "), style = MaterialTheme.typography.headlineMedium, color = Turq.Ink)
            Text(m.firstName, style = MaterialTheme.typography.headlineMedium, color = Turq.Accent)
            Spacer1()
            Text(m.homeStation ?: m.tenantName, color = Turq.Muted, fontSize = 13.sp)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Turq.Surface2).padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                Ring(m.points.toFloat(), ringMax.toFloat(), m.points.toString(), tr("puntos"))
                Column {
                    Text(money(m.valueCents), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 22.sp, color = Turq.Ink)
                    Text(m.nextReward?.let { tr("faltan {n} pts para usarlos", "n" to it.pointsMissing) } ?: tr("listos para usar"), color = Turq.Muted, fontSize = 13.sp)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Turq.Surface2).padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PictoBadge(Pictos.coins)
                Text(money(m.wallet.availableCents), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Turq.Ink)
                Text(tr("dinero virtual"), color = Turq.Muted, fontSize = 12.sp)
                m.wallet.nextExpiry?.takeIf { it.cents > 0 }?.let { Pill(tr("vence {date}", "date" to shortDate(it.at)), Turq.Warn, Turq.WarnSoft) }
            }
            Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Turq.Surface2).padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Ring(m.stamps.toFloat(), m.stampsForReward.toFloat(), "${m.stamps}/${m.stampsForReward}", tr("sellos"), size = 84.dp, color = Turq.Navy)
                Text(if (left > 0) tr("{n} más", "n" to left) else tr("Completo"), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Turq.Ink)
                Text(if (left > 0) tr("para tu regalo") else tr("reclama tu regalo"), color = Turq.Muted, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Resumen(m: PortalMembership, api: LealtadApi, t: String, onPromos: () -> Unit, onReload: () -> Unit, onConsent: (Boolean) -> Unit) {
    Card {
        SectionTitle(tr("Promociones del mes"))
        PosterSlider(m.promotions, onOpen = onPromos)
    }
    val next = m.promotions.firstOrNull { it.progress != null }
    Card(accent = true) {
        SectionTitle(tr("Tu siguiente premio"))
        val progress = next?.progress
        if (next != null && progress != null) {
            Text(progress.text, style = MaterialTheme.typography.titleMedium, color = Turq.Ink)
            ProgressBar(progress.current, progress.target, progress.unit)
            Text(next.name, color = Turq.Muted, fontSize = 13.sp)
        } else {
            Text(m.nextReward?.let { tr("Te faltan {n} puntos para pagar con puntos.", "n" to it.pointsMissing) } ?: tr("Ya puedes pagar con tus puntos en tu próxima carga."), style = MaterialTheme.typography.titleMedium, color = Turq.Ink)
        }
    }
    val pending = m.scratchCards.filter { it.status == "available" }
    if (m.scratchCards.isNotEmpty()) {
        Card {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionTitle(tr("Rasca y Gana"))
                if (pending.isNotEmpty()) Pill(tr("{n} por rascar", "n" to pending.size), Turq.Warn, Turq.WarnSoft)
            }
            (pending.ifEmpty { m.scratchCards }).take(1).forEach { c -> ScratchCard(card = c, onReveal = { api.revealScratch(t, c.id, portal = true) }, onRevealed = { onReload() }) }
            if (pending.size > 1) Text(tr("Rasca esta y aparece la siguiente. Te quedan {n} más.", "n" to pending.size - 1), color = Turq.Muted, fontSize = 13.sp)
        }
    }
    if (m.notifications.isNotEmpty()) {
        Card {
            SectionTitle(tr("Avisos"))
            m.notifications.take(4).forEach { n ->
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PictoBadge(Pictos.bell, size = 36.dp, color = Turq.Muted, bg = Turq.Surface3)
                    Column(Modifier.weight(1f)) { Text(n.title, fontWeight = FontWeight.Bold, color = Turq.Ink); Text(n.body, color = Turq.Muted, fontSize = 13.sp) }
                    Text(shortDate(n.createdAt), color = Turq.Muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                }
            }
        }
    }
    val marketing = m.consents.lastOrNull { it.purpose == "marketing" }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = (marketing?.granted ?: 0) == 1, onCheckedChange = onConsent)
            Column { Text(tr("Recibir promociones por WhatsApp"), fontWeight = FontWeight.Bold, color = Turq.Ink); Text(tr("Los avisos de tu cuenta llegan de todas formas."), color = Turq.Muted, fontSize = 13.sp) }
        }
    }
}

@Composable
private fun Promos(m: PortalMembership, prefs: Prefs) {
    var favorites by remember { mutableStateOf(prefs.favorites) }
    var filter by rememberSaveable { mutableStateOf("todas") }
    val visible = m.promotions.filter { when (filter) { "cerca" -> it.nearby; "fav" -> it.id in favorites; else -> true } }
    Card {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("todas" to tr("Todas · {n}", "n" to m.promotions.size), "cerca" to tr("Cerca de ti"), "fav" to tr("Favoritas · {n}", "n" to m.promotions.count { it.id in favorites })).forEach { (k, label) ->
                Text(label, color = if (filter == k) Color.White else Turq.Ink2, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(CircleShape).background(if (filter == k) Turq.Accent else Turq.Surface2).clickable { filter = k }.padding(horizontal = 12.dp, vertical = 8.dp))
            }
        }
        if (visible.isEmpty()) Text(if (filter == "fav") tr("Marca con la estrella las que quieras tener a la mano.") else tr("No hay promociones con este filtro."), color = Turq.Muted)
        visible.forEach { p -> PromoCard(p, p.id in favorites) { favorites = if (p.id in favorites) favorites - p.id else favorites + p.id; prefs.favorites = favorites } }
    }
}

@Composable
private fun PromoCard(p: PortalPromotion, fav: Boolean, onFav: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Turq.Surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PosterThumb(posterFor(p).res)
            Column(Modifier.weight(1f)) {
                Text(p.benefitLabel, style = MaterialTheme.typography.titleMedium, color = Turq.AccentStrong)
                Text(p.name, color = Turq.Muted, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                    if (p.endsSoon) Pill(tr("termina pronto"), Turq.Warn, Turq.WarnSoft)
                    if (p.nearby) Pill(tr("cerca de ti"), Turq.Ok, Turq.OkSoft)
                    if (p.usedByMe > 0) Pill(if (p.usedByMe == 1) tr("usada 1 vez") else tr("usada {n} veces", "n" to p.usedByMe), Turq.Ink2, Turq.Surface3)
                }
            }
            Text(if (fav) "★" else "☆", fontSize = 22.sp, color = if (fav) Turq.Warn else Turq.LineStrong, modifier = Modifier.clickable(onClick = onFav).padding(4.dp))
        }
        p.progress?.let { pr ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Turq.Surface2).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(pr.text, fontWeight = FontWeight.Bold, color = Turq.Ink, fontSize = 14.sp)
                ProgressBar(pr.current, pr.target, pr.unit)
            }
        }
        TextButton(onClick = { open = !open }) { Text(if (open) tr("Ocultar condiciones") else tr("¿Cómo funciona?"), color = Turq.AccentStrong, fontWeight = FontWeight.Bold) }
        if (open) {
            Text(p.condition, color = Turq.Ink, fontSize = 14.sp)
            val vigencia = p.endsAt?.let { tr("Hasta el {date}", "date" to shortDate(it)) } ?: p.startsAt?.let { tr("Desde el {date}", "date" to shortDate(it)) } ?: tr("Sin fecha límite")
            Text("• $vigencia", color = Turq.Muted, fontSize = 13.sp)
            Text(tr("• Válida en: {stations}", "stations" to (if (p.stationNames.isEmpty()) tr("todas las estaciones") else p.stationNames.take(3).joinToString(", "))), color = Turq.Muted, fontSize = 13.sp)
            p.restrictions.forEach { Text("• $it", color = Turq.Muted, fontSize = 13.sp) }
        }
        HorizontalDivider(color = Turq.Line)
    }
}

@Composable
private fun Dinero(m: PortalMembership) {
    val w = m.wallet
    Card {
        SectionTitle(tr("Tu dinero virtual"), tr("Te lo regalan las promociones y se descuenta de tu siguiente compra."))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(Modifier.weight(1f), Pictos.coins, money(w.availableCents), tr("disponible"), Turq.AccentStrong)
            Stat(Modifier.weight(1f), Pictos.gift, money(w.generatedCents), tr("recibido"), Turq.Ok)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(Modifier.weight(1f), Pictos.store, money(w.usedCents), tr("usado"), Turq.Ink)
            Stat(Modifier.weight(1f), Pictos.bell, money(w.expiredCents), tr("vencido"), Turq.Crit)
        }
        w.nextExpiry?.takeIf { it.cents > 0 }?.let { Notice(tr("Usa {amount} antes del {date} o se vence.", "amount" to money(it.cents), "date" to shortDate(it.at)), Turq.Warn, Turq.WarnSoft) }
        if (w.movements.isEmpty()) Text(tr("Aún no tienes movimientos."), color = Turq.Muted)
        w.movements.take(10).forEach { Movement(it) }
    }
    Card {
        SectionTitle(tr("Tus cupones"), tr("Muestra el código en la estación o con el negocio aliado."))
        if (m.coupons.isEmpty()) Text(tr("Cuando ganes un cupón aparecerá aquí con su código."), color = Turq.Muted)
        m.coupons.forEach { CouponRow(it) }
    }
}

@Composable
private fun Stat(modifier: Modifier, picto: Int, value: String, label: String, color: Color) {
    Row(modifier.clip(RoundedCornerShape(12.dp)).background(Turq.Surface2).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PictoBadge(picto, size = 36.dp, color = color, bg = Turq.Surface)
        Column { Text(value, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = color, fontSize = 17.sp); Text(label, color = Turq.Muted, fontSize = 12.sp) }
    }
}

@Composable
private fun Movement(mv: WalletMovement) {
    val positive = mv.kind == "earn"
    val negative = mv.kind in listOf("spend", "expire", "cancel")
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Turq.Surface2).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PictoBadge(if (positive) Pictos.gift else Pictos.store, size = 36.dp, color = if (positive) Turq.Ok else Turq.Crit, bg = if (positive) Turq.OkSoft else Turq.CritSoft)
        Column(Modifier.weight(1f)) {
            Text(tr(WALLET_KIND[mv.kind] ?: mv.kind) + (mv.promotionName?.let { " · $it" } ?: mv.note?.let { " · $it" } ?: ""), fontWeight = FontWeight.Bold, color = Turq.Ink, fontSize = 14.sp)
            Text(listOfNotNull(shortDate(mv.createdAt), if (positive) WALLET_STATUS[mv.status]?.let { tr(it) } else null, mv.expiresAt?.takeIf { positive && mv.status in listOf("active", "partial") }?.let { tr("vence {date}", "date" to shortDate(it)) }).joinToString(" · "), color = Turq.Muted, fontSize = 12.sp)
        }
        Text((if (positive) "+" else if (negative) "−" else "") + money(mv.amountCents), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = if (positive) Turq.Ok else if (negative) Turq.Crit else Turq.Ink)
    }
}

@Composable
private fun CouponRow(c: Coupon) {
    val live = c.status == "issued"
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Turq.Surface).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PictoBadge(Pictos.tag, size = 40.dp, color = if (live) Turq.AccentStrong else Turq.Muted)
        Column(Modifier.weight(1f)) {
            Text(c.label ?: c.promotionName ?: tr("Cupón"), fontWeight = FontWeight.Bold, color = Turq.Ink)
            Text(listOfNotNull(c.partnerName, if (c.status == "redeemed") tr("usado {date}", "date" to shortDate(c.redeemedAt)) else tr("hasta {date}", "date" to shortDate(c.validUntil))).joinToString(" · "), color = Turq.Muted, fontSize = 12.sp)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(c.code, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = if (live) Turq.AccentStrong else Turq.Muted, letterSpacing = 2.sp)
            Pill(tr(COUPON_STATUS[c.status] ?: c.status), if (live) Turq.Ok else Turq.Muted, if (live) Turq.OkSoft else Turq.Surface3)
        }
    }
}

@Composable
private fun Cargas(m: PortalMembership) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle(tr("Tus sellos"), tr("Junta {n} cargas y llévate un regalo.", "n" to m.stampsForReward))
            Spacer1()
            Text("${m.stamps} / ${m.stampsForReward}", fontFamily = FontFamily.Monospace, color = Turq.Muted)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(m.stampsForReward) { i ->
                val on = i < m.stamps
                Box(Modifier.size(44.dp).clip(CircleShape).background(if (on) Turq.Accent else Color.Transparent), contentAlignment = Alignment.Center) {
                    if (on) Picto(Pictos.pump, size = 22.dp, color = Color.White) else Box(Modifier.size(44.dp).clip(CircleShape).background(Turq.Surface2))
                }
            }
        }
    }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle(tr("Tus últimas cargas"))
            Spacer1()
            Pill(tr("{n} este mes", "n" to m.stats.visitsThisMonth), Turq.Ink2, Turq.Surface3)
        }
        if (m.entries.isEmpty()) Text(tr("Todavía no hay movimientos. Tu próxima carga ya cuenta."), color = Turq.Muted)
        m.entries.take(12).forEach { EntryRow(it) }
    }
}

@Composable
private fun EntryRow(e: Entry) {
    val pos = e.points_delta > 0
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Turq.Surface2).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PictoBadge(if (e.kind == "earn") Pictos.pump else Pictos.gift, size = 36.dp, color = if (pos) Turq.Ok else if (e.points_delta < 0) Turq.Crit else Turq.Muted, bg = if (pos) Turq.OkSoft else if (e.points_delta < 0) Turq.CritSoft else Turq.Surface3)
        Column(Modifier.weight(1f)) {
            Text(tr(KIND[e.kind] ?: e.kind) + (e.liters_ml?.takeIf { e.fuel_type != null }?.let { " ${liters(it)}" } ?: "") + (e.store_cents?.takeIf { it > 0 }?.let { tr(" · tienda {amount}", "amount" to money(it)) } ?: ""), fontWeight = FontWeight.Bold, color = Turq.Ink, fontSize = 14.sp)
            Text(listOfNotNull(shortDate(e.created_at), e.station).joinToString(" · "), color = Turq.Muted, fontSize = 12.sp)
        }
        Text((if (pos) "+" else "") + e.points_delta, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = if (pos) Turq.Ok else if (e.points_delta < 0) Turq.Crit else Turq.Ink)
    }
}
