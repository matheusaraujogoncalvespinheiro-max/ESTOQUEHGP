// Relatório (PDF) de transferência de materiais

function generateTransferReportMulti(transfer, items) {
    const reportWindow = window.open('', '_blank');
    const itemsHtml = items.map(item => {
        const product = findProductByBarcodeAndSetor(item.barcode, transfer.fromSetor) || {};
        const empresa = product.empresa || '-';
        const marca = product.marca || '-';
        const lote = product.lotes && product.lotes.length > 0 ? product.lotes[0].lote : (product.lote || '-');
        
        let validade = '-';
        if (product.lotes && product.lotes.length > 0) {
            const spl = product.lotes[0].validade.split('-');
            if (spl.length === 3) validade = `${spl[2]}/${spl[1]}/${spl[0]}`;
        } else if (product.validade) {
            validade = product.validade;
        }
        
        return `
        <tr>
            <td style="border: 1px solid #ccc; padding: 5px;">${item.barcode}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${item.material || item.descricao}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${empresa} <br> <small>${marca}</small></td>
            <td style="border: 1px solid #ccc; padding: 5px;">${lote}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${validade}</td>
            <td style="border: 1px solid #ccc; padding: 5px; text-align: center;"><b>${item.quantity}</b></td>
        </tr>
        `;
    }).join('');

    const html = `
        <html>
        <head>
            <title>Relatório de Transferência #${transfer.id}</title>
            <style>
                body {font-family: Arial, sans-serif; margin: 40px; font-size: 12px;}
                .header {text-align: center; margin-bottom: 20px;}
                .info {margin-bottom: 20px; display: flex; justify-content: space-between;}
                table {width: 100%; border-collapse: collapse; margin-bottom: 40px;}
                th {background-color: #f3f4f6; padding: 8px; border: 1px solid #ccc;}
                .signature {margin-top: 60px; display: flex; justify-content: space-around;}
                .signature div {width: 40%; text-align: center;}
                .signature-line {border-top: 1px solid #000; margin-top: 40px;}
            </style>
        </head>
        <body class="print-content">
            <div class="header">
                <h2>${transfer.status === 'COMPLETED' ? 'Comprovante Definitivo de Transferência' : 'Guia de Transferência e Conferência'} #${transfer.id}</h2>
            </div>
            <div class="info">
                <div><strong>Origem (Emissor):</strong> ${transfer.fromSetor}</div>
                <div><strong>Destino (Recebedor):</strong> ${transfer.toSetor}</div>
                <div><strong>Data:</strong> ${new Date(transfer.date).toLocaleString('pt-PT')}</div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th style="width: 15%">Cód. Barras</th>
                        <th style="width: 35%">Material</th>
                        <th style="width: 20%">Empresa/Marca</th>
                        <th style="width: 10%">Lote</th>
                        <th style="width: 10%">Validade</th>
                        <th style="width: 10%">Qtd</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="signature">
                <div>
                    ${transfer.status === 'COMPLETED' ? `
                        <b>Autorizado por (Origem):</b><br/>
                        ${transfer.approved_by || transfer.fromSetor}<br/>
                        <small>${new Date(transfer.approval_date || transfer.date).toLocaleString('pt-BR')}</small>
                    ` : `
                        <div class="signature-line"></div>
                        <div><strong>${transfer.fromSetor}</strong><br>Responsável pelo Envio</div>
                    `}
                </div>
                <div>
                    ${transfer.status === 'COMPLETED' ? `
                        <b>Recebido por (Destino):</b><br/>
                        ${transfer.received_by || transfer.toSetor}<br/>
                        <small>${new Date(transfer.completion_date || transfer.date).toLocaleString('pt-BR')}</small>
                    ` : `
                        <div class="signature-line"></div>
                        <div><strong>${transfer.toSetor}</strong><br>Responsável pelo Recebimento (Baixa)</div>
                    `}
                </div>
            </div>
            
            <script>
                window.onload = () => { window.print(); };
            </script>
        </body>
        </html>
    `;
    reportWindow.document.write(html);
    reportWindow.document.close();
}
