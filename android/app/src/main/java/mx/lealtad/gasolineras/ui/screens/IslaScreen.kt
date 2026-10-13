package mx.lealtad.gasolineras.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import mx.lealtad.core.data.RevealResponse
import mx.lealtad.core.data.ApiException
import mx.lealtad.core.data.AppliedPromo
import mx.lealtad.core.data.CUSTOMER_TYPES
import mx.lealtad.core.data.LealtadApi
import mx.lealtad.core.data.LookupResponse
import mx.lealtad.core.data.Member
import mx.lealtad.core.data.PAYMENT_METHODS
import mx.lealtad.core.data.PreviewResponse
import mx.lealtad.core.data.PromoHint
import mx.lealtad.core.data.SaleResponse
import mx.lealtad.core.data.ScratchCardDto
import mx.lealtad.core.data.Session
import mx.lealtad.core.data.litros
import mx.lealtad.core.data.pesos
import mx.lealtad.gasolineras.ui.BigNumber
import mx.lealtad.gasolineras.ui.ChipRow
import mx.lealtad.gasolineras.ui.GhostButton
import mx.lealtad.gasolineras.ui.GlassCard
import mx.lealtad.gasolineras.ui.Notice
import mx.lealtad.gasolineras.ui.Pill
import mx.lealtad.gasolineras.ui.PrimaryButton
import mx.lealtad.gasolineras.ui.ProgressBar
import mx.lealtad.gasolineras.ui.ScratchCard
import mx.lealtad.core.plate.Plate
import mx.lealtad.core.plate.PlateScanner
import mx.lealtad.core.plate.ScannerColors
import mx.lealtad.gasolineras.ui.SectionLabel
import mx.lealtad.gasolineras.ui.Spacer1
import mx.lealtad.gasolineras.ui.StampsRow
import mx.lealtad.gasolineras.ui.TicketLine
import mx.lealtad.gasolineras.ui.theme.Tech
import kotlin.math.roundToInt

private val PRICES = mapOf("regular" to "23.89", "premium" to "25.99", "diesel" to "25.49")
private val FUEL_LABELS = listOf("regular" to "Regular", "premium" to "Premium", "diesel" to "Diésel", "" to "Solo tienda")
private const val PREVIEW_DEBOUNCE_MS = 400L

private data class Redemption(val id: String, val points: Int, val valueCents: Int, val devCode: String?, val confirmed: Boolean)

@Composable
fun IslaScreen(api: LealtadApi, session: Session, onExpired: () -> Unit) {
    val token = session.token
    val scope = rememberCoroutineScope()

    var phone by rememberSaveable { mutableStateOf("") }
    var plateMode by rememberSaveable { mutableStateOf(false) }
    var plate by rememberSaveable { mutableStateOf("") }
    var scanning by remember { mutableStateOf(false) }
    var regPhone by rememberSaveable { mutableStateOf("") }
    var lookup by remember { mutableStateOf<LookupResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    // Alta breve
    var firstName by rememberSaveable { mutableStateOf("") }
    var marketing by rememberSaveable { mutableStateOf(false) }
    var customerType by rememberSaveable { mutableStateOf("particular") }
    var birthday by rememberSaveable { mutableStateOf("") }

    // Despacho
    var pump by rememberSaveable { mutableStateOf("4") }
    var fuel by rememberSaveable { mutableStateOf("regular") }
    var liters by rememberSaveable { mutableStateOf("") }
    var price by rememberSaveable { mutableStateOf(PRICES.getValue("regular")) }
    var store by rememberSaveable { mutableStateOf("") }
    var folio by rememberSaveable { mutableStateOf("") }
    var paymentMethod by rememberSaveable { mutableStateOf("efectivo") }
    var walletSpend by rememberSaveable { mutableStateOf("") }
    var result by remember { mutableStateOf<SaleResponse?>(null) }

    // Vista previa de promociones
    var preview by remember { mutableStateOf<PreviewResponse?>(null) }
    var previewBusy by remember { mutableStateOf(false) }
    var previewError by remember { mutableStateOf<String?>(null) }
    var showSkipped by remember { mutableStateOf(false) }

    // Canje de puntos y verificación
    var redeemPoints by remember { mutableStateOf(0) }
    var redemption by remember { mutableStateOf<Redemption?>(null) }
    var code by remember { mutableStateOf("") }
    var verifyChallenge by remember { mutableStateOf<Pair<String, String?>?>(null) }
    var verifyCode by remember { mutableStateOf("") }
    var showScratch by remember { mutableStateOf(false) }

    // Cupones
    var couponCode by rememberSaveable { mutableStateOf("") }
    var couponNotice by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    val member: Member? = lookup?.member
    /** Con lo que se identifica al cliente: su celular o la placa de su vehículo. */
    val ident = if (plateMode) plate else phone
    val identReady = if (plateMode) Plate.isComplete(plate) else phone.filter(Char::isDigit).length >= 10
    val litersMl = ((liters.toDoubleOrNull() ?: 0.0) * 1000).roundToInt()
    val priceCents = ((price.toDoubleOrNull() ?: 0.0) * 100).roundToInt()
    val storeCents = ((store.toDoubleOrNull() ?: 0.0) * 100).roundToInt()
    val fuelCents = if (fuel.isNotEmpty()) (litersMl.toLong() * priceCents / 1000).toInt() else 0
    val totalCents = fuelCents + storeCents
    val rewardCents = redemption?.takeIf { it.confirmed }?.valueCents ?: 0
    val confirmedRedemptionId = redemption?.takeIf { it.confirmed }?.id
    val inputsValid = totalCents > 0 && (fuel.isEmpty() || (litersMl > 0 && priceCents > 0))
    val walletRequestedCents = ((walletSpend.toDoubleOrNull() ?: 0.0) * 100).roundToInt()
    val maxWalletCents = preview?.maxWalletSpendCents ?: member?.walletAvailableCents ?: 0
    val walletSpendCents = minOf(walletRequestedCents, maxWalletCents).coerceAtLeast(0)

    fun run(block: suspend () -> Unit) {
        busy = true; error = null; notice = null
        scope.launch {
            try { block() } catch (e: ApiException) {
                if (e.status == 401) onExpired()
                error = e.message
            } catch (e: Exception) { error = e.message ?: "Error inesperado" } finally { busy = false }
        }
    }

    fun resetCustomer() { result = null; redemption = null; code = ""; redeemPoints = 0; verifyChallenge = null; verifyCode = ""; showScratch = false; preview = null; walletSpend = ""; showSkipped = false }
    fun resetAll() { resetCustomer(); phone = ""; plate = ""; regPhone = ""; scanning = false; lookup = null; liters = ""; store = ""; folio = ""; paymentMethod = "efectivo"; couponNotice = null }
    fun doLookup(value: String = ident) { resetCustomer(); run { lookup = api.lookup(token, value) } }

    // Vista previa automática: espera a que el capturista deje de teclear y consulta al servidor.
    LaunchedEffect(member?.membershipId, fuel, litersMl, priceCents, storeCents, paymentMethod, walletRequestedCents, confirmedRedemptionId, result) {
        if (member == null || result != null || !inputsValid) { preview = null; previewBusy = false; previewError = null; return@LaunchedEffect }
        previewBusy = true
        delay(PREVIEW_DEBOUNCE_MS)
        try {
            preview = api.previewSale(token, ident, folio, pump.toIntOrNull(), fuel.ifEmpty { null }, litersMl, priceCents, storeCents, confirmedRedemptionId, paymentMethod, walletRequestedCents)
            previewError = null
        } catch (e: ApiException) {
            if (e.status == 401) onExpired()
            preview = null; previewError = e.message
        } catch (e: Exception) { preview = null; previewError = e.message } finally { previewBusy = false }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // ---------------- Cliente ----------------
        GlassCard(accent = true) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Cliente", style = MaterialTheme.typography.titleLarge, color = Tech.Ink)
                Spacer1()
                Text("Bomba ${pump.ifBlank { "—" }} · ${session.user.name}", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
            }
            ChipRow(listOf("phone" to "Teléfono", "plate" to "Placa"), if (plateMode) "plate" else "phone", onSelect = { plateMode = it == "plate"; lookup = null; scanning = false })
            if (!plateMode) {
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it.filter { c -> c.isDigit() || c == ' ' }.take(13); lookup = null },
                    label = { Text("Teléfono del cliente") },
                    placeholder = { Text("55 4433 4317") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace, fontSize = 24.sp, letterSpacing = 3.sp, textAlign = TextAlign.Center),
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                if (scanning) {
                    PlateScanner(onPlate = { plate = it; scanning = false; doLookup(it) }, onClose = { scanning = false }, colors = ScannerColors(Tech.Cyan, Tech.CyanDeep, Tech.Muted, Tech.Ink))
                } else {
                    PrimaryButton("Escanear placa", enabled = !busy) { scanning = true }
                }
                OutlinedTextField(
                    value = plate,
                    onValueChange = { plate = Plate.formatInput(it); lookup = null },
                    label = { Text("Placa (ABC-123-D, A01-ABC o 1234A5)") },
                    supportingText = { Plate.kindLabel(plate)?.let { Text("Tipo de vehículo: $it", color = Tech.CyanDeep) } },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii),
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace, fontSize = 24.sp, letterSpacing = 3.sp, textAlign = TextAlign.Center),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton("Buscar", Modifier.weight(1f), enabled = !busy && identReady) { doLookup() }
                GhostButton("Limpiar") { resetAll() }
            }
            error?.let { Notice(it, Tech.Rose) }
            notice?.let { Notice(it, Tech.Mint) }

            val l = lookup
            if (l != null && !l.found && l.blocked) Notice("Este teléfono pertenece a un empleado del grupo y no puede acumular puntos.", Tech.Amber)

            if (l != null && !l.found && !l.blocked) {
                SectionLabel(if (plateMode) "Placa nueva · alta breve" else "Número nuevo · alta breve")
                if (plateMode) {
                    Text("Pide su celular y su nombre. La placa $plate queda asociada a su número.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(value = regPhone, onValueChange = { regPhone = it.filter { c -> c.isDigit() || c == ' ' }.take(13) }, label = { Text("Teléfono del cliente") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
                }
                OutlinedTextField(value = firstName, onValueChange = { firstName = it }, label = { Text("Nombre de pila") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Text("Tipo de cliente", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                ChipRow(CUSTOMER_TYPES, customerType, onSelect = { customerType = it })
                OutlinedTextField(
                    value = birthday,
                    onValueChange = { birthday = it.filter { c -> c.isDigit() || c == '-' }.take(10) },
                    label = { Text("Cumpleaños (opcional)") },
                    placeholder = { Text("aaaa-mm-dd") },
                    supportingText = { Text("Sirve para la promoción de cumpleaños.", color = Tech.Muted) },
                    isError = birthday.isNotBlank() && !birthday.matches(Regex("\\d{4}-\\d{2}-\\d{2}")),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = true, onCheckedChange = null); Text("Participa en el programa de ${session.tenant.name} (necesario)", color = Tech.Ink, style = MaterialTheme.typography.bodyMedium) }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = marketing, onCheckedChange = { marketing = it }); Text("Acepta promociones por WhatsApp (opcional)", color = Tech.Ink, style = MaterialTheme.typography.bodyMedium) }
                Text(session.program.description, color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                val birthdayOk = birthday.isBlank() || birthday.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))
                PrimaryButton("Registrar", enabled = !busy && firstName.isNotBlank() && birthdayOk && (!plateMode || regPhone.filter(Char::isDigit).length >= 10)) {
                    run {
                        val m = if (plateMode) api.enroll(token, regPhone, firstName.trim(), marketing, customerType, birthday.trim().ifBlank { null }, plate)
                        else api.enroll(token, phone, firstName.trim(), marketing, customerType, birthday.trim().ifBlank { null })
                        lookup = LookupResponse(found = true, member = m)
                        notice = "${m.firstName} quedó registrado."
                        firstName = ""; marketing = false; customerType = "particular"; birthday = ""; regPhone = ""
                    }
                }
            }

            if (member != null) {
                Row(verticalAlignment = Alignment.Top) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(member.firstName, fontWeight = FontWeight.Bold, color = Tech.Ink, fontSize = 18.sp)
                            Text(member.maskedPhone, fontFamily = FontFamily.Monospace, color = Tech.Muted, fontSize = 13.sp)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (member.verified) Pill("verificado", Tech.Mint) else Pill("sin verificar", Tech.Amber)
                            Pill(member.customerTypeLabel, Tech.Violet)
                        }
                    }
                    Spacer1()
                    BigNumber(member.points.toString(), "puntos ≈ ${pesos(member.valueCents)}", alignEnd = true)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Sellos", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                    StampsRow(member.stamps, member.stampsForReward)
                    Spacer1()
                    member.nextReward?.let { Text("Faltan ${it.pointsMissing} pts", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium) } ?: Pill("Puede canjear")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Dinero virtual", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                    Spacer1()
                    Text(pesos(member.walletAvailableCents), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = if (member.walletAvailableCents > 0) Tech.Mint else Tech.Muted)
                }
                val coupons = lookup?.coupons.orEmpty()
                SectionLabel("Beneficios del cliente")
                coupons.forEach { c -> Notice("Cupón ${c.code} · ${c.label ?: c.promotionName ?: "beneficio"}${c.validUntil?.let { " · vence ${it.take(10)}" } ?: ""}", Tech.Cyan) }
                if (member.walletAvailableCents > 0) Notice("Tiene ${pesos(member.walletAvailableCents)} de dinero virtual para pagar esta carga.", Tech.Mint)
                if (coupons.isEmpty() && member.walletAvailableCents <= 0 && member.scratchPending == 0) Text("Sin cupones ni dinero virtual. Al registrar la carga se aplican las promociones vigentes.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                if (member.scratchPending > 0) Notice("🎟️ ${member.scratchPending} Rasca y Gana pendiente${if (member.scratchPending > 1) "s" else ""}. El cliente puede rascar en su portal o aquí al terminar la carga.", Tech.Violet)

                if (!member.verified) {
                    val vc = verifyChallenge
                    if (vc == null) TextButton(onClick = { run { val r = api.verifyStart(token, ident); verifyChallenge = r.challengeId to r.devCode } }) { Text("Enviar código para confirmar teléfono", color = Tech.Cyan) }
                    else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = verifyCode, onValueChange = { verifyCode = it.filter(Char::isDigit).take(4) }, label = { Text("Código") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(130.dp))
                        GhostButton("Confirmar", enabled = !busy && verifyCode.length == 4) {
                            run { api.verifyConfirm(token, vc.first, verifyCode); verifyChallenge = null; verifyCode = ""; notice = "Teléfono confirmado."; lookup = api.lookup(token, ident) }
                        }
                        vc.second?.let { Pill("demo: $it", Tech.Muted) }
                    }
                }

                if (member.canRedeem && result == null) {
                    SectionLabel("Canje · requiere código del cliente")
                    val r = redemption
                    when {
                        r == null -> {
                            val options = generateSequence(member.redemption.minPoints) { it + member.redemption.stepPoints }.takeWhile { it <= member.availablePoints }.toList()
                            ChipRow(options.take(4).map { p -> p.toString() to "$p pts = ${pesos(p * member.redemption.pointValueCents)}" }, redeemPoints.toString(), onSelect = { redeemPoints = it.toInt() })
                            GhostButton("Enviar código al cliente", Modifier.fillMaxWidth(), enabled = !busy && redeemPoints > 0) {
                                run { val p = api.prepareRedemption(token, ident, redeemPoints); redemption = Redemption(p.redemptionId, p.points, p.valueCents, p.devCode, false) }
                            }
                        }
                        r.confirmed -> Row(verticalAlignment = Alignment.CenterVertically) {
                            Pill("Canje de ${r.points} pts (${pesos(r.valueCents)}) listo", Tech.Mint)
                            Spacer1()
                            TextButton(onClick = { run { api.cancelRedemption(token, r.id); redemption = null; code = "" } }) { Text("Quitar", color = Tech.Cyan) }
                        }
                        else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Código enviado al cliente (${r.points} pts)", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(value = code, onValueChange = { code = it.filter(Char::isDigit).take(4) }, placeholder = { Text("0000") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(120.dp))
                                PrimaryButton("Confirmar", Modifier.weight(1f), enabled = !busy && code.length == 4) {
                                    run { api.confirmRedemption(token, r.id, code); redemption = r.copy(confirmed = true); notice = "Canje confirmado. Se aplicará al registrar el despacho." }
                                }
                            }
                            Row {
                                TextButton(onClick = { run { api.cancelRedemption(token, r.id); redemption = null; code = "" } }) { Text("Cancelar", color = Tech.Cyan) }
                                r.devCode?.let { Pill("demo: código $it", Tech.Muted) }
                            }
                        }
                    }
                }
            }
        }

        // ---------------- Despacho ----------------
        GlassCard {
            Text("Despacho", style = MaterialTheme.typography.titleLarge, color = Tech.Ink)
            FUEL_LABELS.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    pair.forEach { (key, label) ->
                        FilterChip(modifier = Modifier.weight(1f), selected = fuel == key, onClick = { fuel = key; PRICES[key]?.let { price = it } },
                            label = { Text(label, maxLines = 1, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Tech.Cyan.copy(alpha = 0.2f), selectedLabelColor = Tech.CyanDeep, labelColor = Tech.Ink))
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = pump, onValueChange = { pump = it.filter(Char::isDigit).take(2) }, label = { Text("Bomba") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(90.dp))
                if (fuel.isNotEmpty()) {
                    OutlinedTextField(value = liters, onValueChange = { liters = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Litros") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                    OutlinedTextField(value = price, onValueChange = { price = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Precio/L") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = store, onValueChange = { store = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Tienda y servicios ($)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                OutlinedTextField(value = folio, onValueChange = { folio = it.uppercase() }, label = { Text("Folio") }, placeholder = { Text("T-118342") }, singleLine = true, modifier = Modifier.weight(1f))
            }

            Text("Forma de pago", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
            ChipRow(PAYMENT_METHODS, paymentMethod, onSelect = { paymentMethod = it }, color = Tech.Violet)

            val res = result
            val walletAvailable = preview?.walletAvailableCents ?: member?.walletAvailableCents ?: 0
            if (res == null && member != null && walletAvailable > 0) {
                OutlinedTextField(
                    value = walletSpend,
                    onValueChange = { walletSpend = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Pagar con dinero virtual ($)") },
                    supportingText = { Text("Disponible ${pesos(walletAvailable)} · máximo en esta compra ${pesos(maxWalletCents)}", color = Tech.Muted) },
                    trailingIcon = { TextButton(onClick = { walletSpend = String.format(java.util.Locale.US, "%.2f", maxWalletCents / 100.0) }) { Text("Todo", color = Tech.Cyan) } },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Ticket: con vista previa usa los importes del servidor; sin ella, los calculados en la tableta.
            val pv = preview
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (fuel.isNotEmpty()) TicketLine("$fuel ${litros(litersMl)} × ${pesos(priceCents)}", pesos(res?.fuelCents ?: fuelCents))
                val sc = res?.storeCents ?: storeCents
                if (sc > 0) TicketLine("Tienda y servicios", pesos(sc))
                val rc = res?.rewardCents ?: rewardCents
                if (rc > 0) TicketLine("Canje con puntos", "−${pesos(rc)}")
                val dc = res?.discountCents ?: pv?.discountCents ?: 0
                if (dc > 0) TicketLine("Descuento por promoción", "−${pesos(dc)}")
                val wc = res?.walletSpentCents ?: pv?.walletSpendCents ?: 0
                if (wc > 0) TicketLine("Dinero virtual", "−${pesos(wc)}")
                val paid = res?.paidCents ?: pv?.paidCents ?: maxOf(0, totalCents - rewardCents)
                TicketLine(if (res != null) "Pagó el cliente" else "Paga el cliente", pesos(paid), strong = true)
                TicketLine("Forma de pago", PAYMENT_METHODS.firstOrNull { it.first == (res?.paymentMethod ?: paymentMethod) }?.second ?: paymentMethod)
            }

            if (res == null) {
                val canRegister = !busy && member != null && folio.isNotBlank() && inputsValid
                PrimaryButton(if (member != null) "Registrar para ${member.firstName}" else "Busca un cliente primero", enabled = canRegister) {
                    run {
                        val spend = preview?.walletSpendCents ?: walletSpendCents
                        val r = api.registerSale(token, ident, folio.trim(), pump.toIntOrNull(), fuel.ifEmpty { null }, litersMl, priceCents, storeCents, confirmedRedemptionId, paymentMethod, spend)
                        result = r; lookup = LookupResponse(found = true, member = r.member); redemption = null; preview = null
                    }
                }
            } else {
                SaleResultCard(res, api, token, showScratch, onShowScratch = { showScratch = true }, onVoid = {
                    run { val v = api.voidSale(token, res.saleId, "error de captura"); notice = "Venta anulada. Saldo: ${v.balance} puntos."; result = null; lookup = api.lookup(token, phone) }
                }, onRevealed = { r ->
                    notice = "🎉 Rasca y Gana: ${r.prize.label}. Nuevo saldo: ${r.balance} puntos."
                    lookup = LookupResponse(found = true, member = res.member.copy(points = r.balance, valueCents = r.balance * res.member.redemption.pointValueCents, scratchPending = 0))
                }, onNext = { resetAll() })
            }
        }

        // ---------------- Promociones (vista previa) ----------------
        if (member != null && result == null && (preview != null || previewBusy || previewError != null)) {
            PromoPreviewCard(preview, previewBusy, previewError, showSkipped, onToggleSkipped = { showSkipped = !showSkipped })
        }

        // ---------------- Cupones ----------------
        GlassCard {
            Text("Canjear cupón", style = MaterialTheme.typography.titleMedium, color = Tech.Ink)
            Text("Cupones de promoción o de asociados que el cliente muestra en su portal.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = couponCode,
                    onValueChange = { couponCode = it.uppercase().filter { c -> c.isLetterOrDigit() || c == '-' }.take(24) },
                    placeholder = { Text("PR-XXXXXX") },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace, fontSize = 18.sp, letterSpacing = 1.sp),
                    modifier = Modifier.weight(1f),
                )
                GhostButton("Canjear", enabled = !busy && couponCode.length >= 4) {
                    couponNotice = null
                    run {
                        try {
                            val c = api.redeemCoupon(token, couponCode)
                            couponNotice = "Cupón canjeado: ${c.label ?: couponCode}${if (c.valueCents > 0) " (${pesos(c.valueCents)})" else ""}." to true
                            couponCode = ""
                        } catch (e: ApiException) {
                            if (e.status == 401) onExpired()
                            couponNotice = (e.message ?: "No se pudo canjear.") to false
                        }
                    }
                }
            }
            couponNotice?.let { (msg, ok) -> Notice(msg, if (ok) Tech.Mint else Tech.Rose) }
        }
    }
}

@Composable
private fun PromoPreviewCard(preview: PreviewResponse?, busy: Boolean, error: String?, showSkipped: Boolean, onToggleSkipped: () -> Unit) {
    GlassCard(accent = preview?.promotions?.applied?.isNotEmpty() == true) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Promociones", style = MaterialTheme.typography.titleLarge, color = Tech.Ink)
            Spacer1()
            if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = Tech.Cyan, strokeWidth = 2.dp)
            else preview?.let { Pill("vista previa", Tech.Muted) }
        }
        error?.let { Notice(it, Tech.Amber) }
        val pv = preview ?: return@GlassCard
        val ev = pv.promotions

        if (ev.applied.isEmpty()) Text("Ninguna promoción aplica con estos datos.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
        ev.applied.forEach { AppliedPromoRow(it) }
        if (pv.discountCents > 0 || pv.promoPoints > 0 || pv.walletEarnCents > 0) {
            HorizontalDivider(color = Tech.Outline)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (pv.discountCents > 0) TicketLine("Descuento total", "−${pesos(pv.discountCents)}", strong = true)
                if (pv.promoPoints > 0) TicketLine("Puntos extra por promoción", "+${pv.promoPoints}")
                if (pv.walletEarnCents > 0) TicketLine("Dinero virtual que ganará", "+${pesos(pv.walletEarnCents)}")
                TicketLine("Puntos base", "+${pv.basePoints}")
            }
        }

        if (ev.hints.isNotEmpty()) {
            SectionLabel("Cerca de lograr")
            ev.hints.forEach { HintProgress(it) }
        }

        if (ev.skipped.isNotEmpty()) {
            TextButton(onClick = onToggleSkipped, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                Text((if (showSkipped) "Ocultar" else "Ver") + " ${ev.skipped.size} promoción${if (ev.skipped.size > 1) "es" else ""} que no aplica${if (ev.skipped.size > 1) "n" else ""}", color = Tech.Cyan)
            }
            AnimatedVisibility(visible = showSkipped) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ev.skipped.forEach { s ->
                        Column {
                            Text(s.promotionName, color = Tech.Ink, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            Text(s.reason, color = Tech.Muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AppliedPromoRow(a: AppliedPromo) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("✓ ${a.promotionName}", color = Tech.Ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            when {
                a.discountCents > 0 -> Pill("−${pesos(a.discountCents)}", Tech.Mint)
                a.walletCents > 0 -> Pill("+${pesos(a.walletCents)} virtual", Tech.Cyan)
                a.points > 0 -> Pill("+${a.points} pts", Tech.Violet)
                a.couponLabel != null -> Pill("cupón", Tech.Amber)
            }
        }
        if (a.description.isNotBlank()) Text(a.description, color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
        a.couponCode?.let { c ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(c, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 16.sp, letterSpacing = 1.sp, color = Tech.Amber)
                a.couponLabel?.let { Text(it, color = Tech.Muted, fontSize = 12.sp) }
            }
        }
    }
}

/** "Te faltan $80 para obtener…" con barra de importe, o "3 de 5" para conteo de visitas. */
@Composable
private fun HintProgress(h: PromoHint) {
    val tc = h.targetCents; val cc = h.currentCents
    val tn = h.targetCount; val cn = h.currentCount
    when {
        tc != null && tc > 0 -> ProgressBar(h.text, (cc ?: 0).toFloat() / tc, "${pesos(cc ?: 0)} / ${pesos(tc)}")
        tn != null && tn > 0 -> ProgressBar(h.text, (cn ?: 0).toFloat() / tn, "${cn ?: 0} de $tn", color = Tech.Violet)
        else -> Text(h.text, color = Tech.Ink, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun SaleResultCard(
    res: SaleResponse, api: LealtadApi, token: String, showScratch: Boolean,
    onShowScratch: () -> Unit, onVoid: () -> Unit, onRevealed: (RevealResponse) -> Unit, onNext: () -> Unit,
) {
    GlassCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Registrado · folio ${res.posReference}")
            Spacer1()
            TextButton(onClick = onVoid) { Text("Anular", color = Tech.Cyan) }
        }
        Row {
            BigNumber("+${res.points.total + res.points.promo}", "${res.points.fuel} combustible + ${res.points.store} tienda" + (if (res.points.multiplier > 1) " × ${res.points.multiplier.toInt()}" else "") + (if (res.points.promo > 0) " + ${res.points.promo} promo" else ""))
            Spacer1()
            BigNumber(res.member.points.toString(), "saldo ≈ ${pesos(res.member.valueCents)}", alignEnd = true)
        }
        res.points.multiplierLabel?.let { Pill(it, Tech.Violet) }
        if (res.rewardCents > 0) Text("Se canjearon ${pesos(res.rewardCents)}; acumuló sobre ${litros(res.eligibleLitersMl)} pagados.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)

        if (res.promotions.applied.isNotEmpty()) {
            SectionLabel("Promociones aplicadas")
            res.promotions.applied.forEach { AppliedPromoRow(it) }
        }
        val walletEarn = res.promotions.walletEarnCents
        if (walletEarn > 0 || res.walletSpentCents > 0 || res.wallet.availableCents > 0) {
            HorizontalDivider(color = Tech.Outline)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (walletEarn > 0) TicketLine("Dinero virtual ganado", "+${pesos(walletEarn)}")
                if (res.walletSpentCents > 0) TicketLine("Dinero virtual usado", "−${pesos(res.walletSpentCents)}")
                TicketLine("Saldo de dinero virtual", pesos(res.wallet.availableCents), strong = true)
            }
        }
        if (res.stamp.awarded) {
            if (res.stamp.rewardEarned) Notice("¡Completó ${res.stamp.stampsForReward} cargas! Entregar la recompensa por sellos.", Tech.Mint)
            else Text("Sello ${res.stamp.stamps} de ${res.stamp.stampsForReward}.", color = Tech.Muted, style = MaterialTheme.typography.bodyMedium)
        }
        res.scratch?.let { sc ->
            Notice("🎉 Carga, Rasca y Gana: su carga superó $500 y ganó una tarjeta. Vence el ${sc.expiresAt.take(10)}.", Tech.Violet)
            if (!showScratch) GhostButton("Rascar en esta pantalla", Modifier.fillMaxWidth()) { onShowScratch() }
            else ScratchCard(
                card = ScratchCardDto(id = sc.cardId, status = "available", expiresAt = sc.expiresAt, saleReference = res.posReference),
                onReveal = { api.revealScratch(token, sc.cardId, portal = false) },
                onRevealed = onRevealed,
            )
        }
        GhostButton("Siguiente cliente", Modifier.fillMaxWidth()) { onNext() }
    }
}
